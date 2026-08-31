-- Nexus workspace foundation hardening.
-- Additive/backward-compatible migration: existing client memory SELECT policy is intentionally
-- retained until the browser runtime is switched to the client-safe RPC in the companion release.

-- 1) Canonical active-engagement identity.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'nexus_projects_company_id_id_key'
      AND conrelid = 'public.nexus_projects'::regclass
  ) THEN
    ALTER TABLE public.nexus_projects
      ADD CONSTRAINT nexus_projects_company_id_id_key UNIQUE (company_id,id);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.nexus_active_engagements (
  company_id uuid PRIMARY KEY REFERENCES public.nexus_companies(id) ON DELETE CASCADE,
  project_id uuid NOT NULL,
  updated_by uuid NOT NULL REFERENCES auth.users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT nexus_active_engagement_company_project_fkey
    FOREIGN KEY (company_id,project_id)
    REFERENCES public.nexus_projects(company_id,id)
    ON DELETE CASCADE
);

ALTER TABLE public.nexus_active_engagements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "nexus members view active engagement" ON public.nexus_active_engagements;
CREATE POLICY "nexus members view active engagement"
ON public.nexus_active_engagements
FOR SELECT TO authenticated
USING (public.nexus_is_platform_admin() OR public.nexus_is_company_member(company_id));

DROP POLICY IF EXISTS "nexus admins manage active engagement" ON public.nexus_active_engagements;
CREATE POLICY "nexus admins manage active engagement"
ON public.nexus_active_engagements
FOR ALL TO authenticated
USING (public.nexus_is_platform_admin())
WITH CHECK (public.nexus_is_platform_admin());

-- Backfill only when a company has exactly one open project. Never guess between multiple projects.
WITH open_projects AS (
  SELECT p.company_id,p.id AS project_id,p.created_by,
         count(*) OVER (PARTITION BY p.company_id) AS open_count
  FROM public.nexus_projects p
  WHERE p.status NOT IN ('complete','cancelled')
)
INSERT INTO public.nexus_active_engagements(company_id,project_id,updated_by,updated_at)
SELECT company_id,project_id,created_by,now()
FROM open_projects
WHERE open_count=1
ON CONFLICT (company_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.nexus_set_active_engagement(p_company_id uuid,p_project_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF NOT public.nexus_is_platform_admin() THEN
    RAISE EXCEPTION 'Nexus administrator access required';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.nexus_projects p
    WHERE p.id=p_project_id
      AND p.company_id=p_company_id
      AND p.status NOT IN ('complete','cancelled')
  ) THEN
    RAISE EXCEPTION 'Active engagement project not found for this company';
  END IF;

  INSERT INTO public.nexus_active_engagements(company_id,project_id,updated_by,updated_at)
  VALUES(p_company_id,p_project_id,auth.uid(),now())
  ON CONFLICT(company_id) DO UPDATE
    SET project_id=excluded.project_id,
        updated_by=excluded.updated_by,
        updated_at=excluded.updated_at;

  RETURN p_project_id;
END
$function$;

REVOKE ALL ON FUNCTION public.nexus_set_active_engagement(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.nexus_set_active_engagement(uuid,uuid) TO authenticated,service_role;

-- 2) Client-safe Company Memory projection. Raw table policy is tightened in a follow-up
-- migration only after the browser has moved to this RPC.
CREATE OR REPLACE FUNCTION public.nexus_get_company_memory_client(p_company_id uuid)
RETURNS TABLE(
  company_id uuid,
  goals text,
  systems text,
  terminology text,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF NOT public.nexus_is_platform_admin() AND NOT public.nexus_is_company_member(p_company_id) THEN
    RAISE EXCEPTION 'Company membership required';
  END IF;

  RETURN QUERY
  SELECT m.company_id,m.goals,m.systems,m.terminology,m.updated_at
  FROM public.nexus_company_memory m
  WHERE m.company_id=p_company_id;
END
$function$;

REVOKE ALL ON FUNCTION public.nexus_get_company_memory_client(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.nexus_get_company_memory_client(uuid) TO authenticated,service_role;

-- 3) Atomic and retry-safe self-service onboarding.
CREATE OR REPLACE FUNCTION public.nexus_onboard_company_atomic(
  p_name text,
  p_website text DEFAULT NULL,
  p_industry text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_user uuid:=auth.uid();
  v_company uuid;
  v_project uuid;
  v_name text:=nullif(btrim(p_name),'');
  v_memberships integer:=0;
  v_open_projects integer:=0;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF v_name IS NULL THEN RAISE EXCEPTION 'Company name is required'; END IF;

  -- Serialize retries from the same signed-in user.
  PERFORM pg_advisory_xact_lock(hashtextextended(v_user::text,0));

  SELECT count(*) INTO v_memberships
  FROM public.nexus_company_members m
  WHERE m.user_id=v_user AND m.active IS TRUE;

  IF v_memberships > 1 THEN
    RAISE EXCEPTION 'This account belongs to multiple workspaces; select an existing company instead.';
  END IF;

  IF v_memberships = 1 THEN
    SELECT m.company_id INTO v_company
    FROM public.nexus_company_members m
    WHERE m.user_id=v_user AND m.active IS TRUE
    LIMIT 1;

    SELECT ae.project_id INTO v_project
    FROM public.nexus_active_engagements ae
    WHERE ae.company_id=v_company;

    IF v_project IS NULL THEN
      SELECT count(*) INTO v_open_projects
      FROM public.nexus_projects p
      WHERE p.company_id=v_company
        AND p.status NOT IN ('complete','cancelled');

      IF v_open_projects = 1 THEN
        SELECT p.id INTO v_project
        FROM public.nexus_projects p
        WHERE p.company_id=v_company
          AND p.status NOT IN ('complete','cancelled')
        LIMIT 1;

        INSERT INTO public.nexus_active_engagements(company_id,project_id,updated_by)
        VALUES(v_company,v_project,v_user)
        ON CONFLICT(company_id) DO NOTHING;
      ELSIF v_open_projects > 1 THEN
        RAISE EXCEPTION 'Existing workspace has multiple open projects; Nexus must select the active engagement.';
      END IF;
    END IF;

    RETURN jsonb_build_object('company_id',v_company,'project_id',v_project,'created',false);
  END IF;

  INSERT INTO public.nexus_companies(name,website,industry,created_by)
  VALUES(v_name,nullif(btrim(p_website),''),nullif(btrim(p_industry),''),v_user)
  RETURNING id INTO v_company;

  INSERT INTO public.nexus_company_members(company_id,user_id,member_role,active,added_by)
  VALUES(v_company,v_user,'owner',true,v_user);

  INSERT INTO public.nexus_projects(
    company_id,name,service_type,service_slug,status,summary,created_by,project_type
  ) VALUES(
    v_company,
    'Nexus Opportunity Assessment',
    'AI Opportunity Assessment / Intake',
    'ai-opportunity-assessment',
    'planning',
    'Initial Nexus discovery, evidence preparation, and opportunity definition.',
    v_user,
    'discovery'
  ) RETURNING id INTO v_project;

  INSERT INTO public.nexus_active_engagements(company_id,project_id,updated_by)
  VALUES(v_company,v_project,v_user);

  RETURN jsonb_build_object('company_id',v_company,'project_id',v_project,'created',true);
END
$function$;

REVOKE ALL ON FUNCTION public.nexus_onboard_company_atomic(text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.nexus_onboard_company_atomic(text,text,text) TO authenticated,service_role;

-- 4) Review actions must only operate on work that was actually submitted for review.
CREATE OR REPLACE FUNCTION public.nexus_approve_task(p_task_id uuid,p_note text DEFAULT NULL::text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE v public.nexus_tasks%rowtype;
BEGIN
  IF NOT public.nexus_is_platform_admin() THEN RAISE EXCEPTION 'Nexus administrator access required'; END IF;
  SELECT * INTO v FROM public.nexus_tasks WHERE id=p_task_id FOR UPDATE;
  IF v.id IS NULL THEN RAISE EXCEPTION 'Task not found'; END IF;
  IF v.status <> 'ready_for_review' THEN RAISE EXCEPTION 'Task is not ready for review'; END IF;

  UPDATE public.nexus_tasks
  SET status='completed',assignee='nexus',review_note=nullif(trim(coalesce(p_note,'')),''),
      reviewed_at=now(),completed_at=now(),updated_at=now()
  WHERE id=p_task_id;

  INSERT INTO public.nexus_activity_log(company_id,actor_id,action,entity_type,entity_id,summary)
  VALUES(v.company_id,auth.uid(),'task_approved','task',v.id,'Nexus approved action: '||v.title);
  RETURN v.id;
END
$function$;

CREATE OR REPLACE FUNCTION public.nexus_request_task_revision(p_task_id uuid,p_note text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE v public.nexus_tasks%rowtype;
BEGIN
  IF NOT public.nexus_is_platform_admin() THEN RAISE EXCEPTION 'Nexus administrator access required'; END IF;
  SELECT * INTO v FROM public.nexus_tasks WHERE id=p_task_id FOR UPDATE;
  IF v.id IS NULL THEN RAISE EXCEPTION 'Task not found'; END IF;
  IF v.status <> 'ready_for_review' THEN RAISE EXCEPTION 'Task is not ready for review'; END IF;
  IF nullif(trim(p_note),'') IS NULL THEN RAISE EXCEPTION 'Revision note is required'; END IF;

  UPDATE public.nexus_tasks
  SET status='needs_revision',assignee='client',review_note=trim(p_note),reviewed_at=now(),updated_at=now(),notify_client=true
  WHERE id=p_task_id;

  INSERT INTO public.nexus_activity_log(company_id,actor_id,action,entity_type,entity_id,summary)
  VALUES(v.company_id,auth.uid(),'task_revision_requested','task',v.id,'Revision requested: '||v.title);
  RETURN v.id;
END
$function$;

REVOKE ALL ON FUNCTION public.nexus_approve_task(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.nexus_approve_task(uuid,text) TO authenticated,service_role;
REVOKE ALL ON FUNCTION public.nexus_request_task_revision(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.nexus_request_task_revision(uuid,text) TO authenticated,service_role;

-- Nexus approval-chain + unified inbox foundation.
-- Construction-document-control pattern: ordered reviewers, one active step at a time,
-- request-changes/reject/resubmit loops, immutable decision history, and a central action inbox.

CREATE TABLE IF NOT EXISTS public.nexus_approval_chains (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.nexus_companies(id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.nexus_projects(id) ON DELETE SET NULL,
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 2 AND 300),
  description text,
  approval_type text NOT NULL DEFAULT 'general',
  entity_type text,
  entity_id uuid,
  visibility text NOT NULL DEFAULT 'internal' CHECK (visibility IN ('internal','company')),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','pending','approved','changes_requested','rejected','cancelled')),
  current_step integer NOT NULL DEFAULT 0 CHECK (current_step >= 0),
  requested_by uuid NOT NULL REFERENCES auth.users(id),
  due_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS nexus_approval_chains_active_entity_uq
  ON public.nexus_approval_chains(entity_type,entity_id,approval_type)
  WHERE entity_type IS NOT NULL AND entity_id IS NOT NULL AND status IN ('draft','pending','changes_requested');
CREATE INDEX IF NOT EXISTS nexus_approval_chains_company_status_idx
  ON public.nexus_approval_chains(company_id,status,updated_at DESC);
CREATE INDEX IF NOT EXISTS nexus_approval_chains_entity_idx
  ON public.nexus_approval_chains(entity_type,entity_id,created_at DESC);

CREATE TABLE IF NOT EXISTS public.nexus_approval_chain_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chain_id uuid NOT NULL REFERENCES public.nexus_approval_chains(id) ON DELETE CASCADE,
  step_order integer NOT NULL CHECK (step_order > 0),
  step_name text NOT NULL CHECK (char_length(btrim(step_name)) BETWEEN 2 AND 200),
  instructions text,
  approver_scope text NOT NULL CHECK (approver_scope IN ('platform_admin','company_member','company_role','specific_user')),
  approver_role text,
  approver_user_id uuid REFERENCES auth.users(id),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','pending','approved','changes_requested','rejected','skipped','cancelled')),
  due_at timestamptz,
  revision_round integer NOT NULL DEFAULT 0 CHECK (revision_round >= 0),
  decided_by uuid REFERENCES auth.users(id),
  decision_note text,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(chain_id,step_order),
  CHECK ((approver_scope='specific_user' AND approver_user_id IS NOT NULL) OR approver_scope<>'specific_user'),
  CHECK ((approver_scope='company_role' AND nullif(btrim(approver_role),'') IS NOT NULL) OR approver_scope<>'company_role')
);
CREATE INDEX IF NOT EXISTS nexus_approval_chain_steps_pending_idx
  ON public.nexus_approval_chain_steps(status,due_at,created_at);

CREATE TABLE IF NOT EXISTS public.nexus_approval_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chain_id uuid NOT NULL REFERENCES public.nexus_approval_chains(id) ON DELETE CASCADE,
  step_id uuid REFERENCES public.nexus_approval_chain_steps(id) ON DELETE SET NULL,
  company_id uuid REFERENCES public.nexus_companies(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  actor_id uuid REFERENCES auth.users(id),
  note text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS nexus_approval_events_chain_idx
  ON public.nexus_approval_events(chain_id,created_at);

ALTER TABLE public.nexus_approvals
  ADD COLUMN IF NOT EXISTS approval_chain_id uuid REFERENCES public.nexus_approval_chains(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS nexus_approvals_chain_idx ON public.nexus_approvals(approval_chain_id);

ALTER TABLE public.nexus_approval_chains ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nexus_approval_chain_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nexus_approval_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "nexus admins manage approval chains" ON public.nexus_approval_chains;
CREATE POLICY "nexus admins manage approval chains" ON public.nexus_approval_chains
FOR ALL TO authenticated USING (public.nexus_is_platform_admin()) WITH CHECK (public.nexus_is_platform_admin());
DROP POLICY IF EXISTS "nexus members view company approval chains" ON public.nexus_approval_chains;
CREATE POLICY "nexus members view company approval chains" ON public.nexus_approval_chains
FOR SELECT TO authenticated USING (visibility='company' AND company_id IS NOT NULL AND public.nexus_is_company_member(company_id));

DROP POLICY IF EXISTS "nexus admins manage approval steps" ON public.nexus_approval_chain_steps;
CREATE POLICY "nexus admins manage approval steps" ON public.nexus_approval_chain_steps
FOR ALL TO authenticated USING (public.nexus_is_platform_admin()) WITH CHECK (public.nexus_is_platform_admin());
DROP POLICY IF EXISTS "nexus members view company approval steps" ON public.nexus_approval_chain_steps;
CREATE POLICY "nexus members view company approval steps" ON public.nexus_approval_chain_steps
FOR SELECT TO authenticated USING (EXISTS (
  SELECT 1 FROM public.nexus_approval_chains c
  WHERE c.id=chain_id AND c.visibility='company' AND c.company_id IS NOT NULL AND public.nexus_is_company_member(c.company_id)
));

DROP POLICY IF EXISTS "nexus admins view approval events" ON public.nexus_approval_events;
CREATE POLICY "nexus admins view approval events" ON public.nexus_approval_events
FOR SELECT TO authenticated USING (public.nexus_is_platform_admin());
DROP POLICY IF EXISTS "nexus members view company approval events" ON public.nexus_approval_events;
CREATE POLICY "nexus members view company approval events" ON public.nexus_approval_events
FOR SELECT TO authenticated USING (EXISTS (
  SELECT 1 FROM public.nexus_approval_chains c
  WHERE c.id=chain_id AND c.visibility='company' AND c.company_id IS NOT NULL AND public.nexus_is_company_member(c.company_id)
));

CREATE OR REPLACE FUNCTION private.nexus_user_can_approve_step(p_step_id uuid,p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE s public.nexus_approval_chain_steps%rowtype; c public.nexus_approval_chains%rowtype;
BEGIN
  IF p_user_id IS NULL THEN RETURN false; END IF;
  SELECT * INTO s FROM public.nexus_approval_chain_steps WHERE id=p_step_id;
  IF s.id IS NULL THEN RETURN false; END IF;
  SELECT * INTO c FROM public.nexus_approval_chains WHERE id=s.chain_id;
  IF c.id IS NULL THEN RETURN false; END IF;
  IF s.approver_scope='platform_admin' THEN RETURN public.nexus_is_platform_admin(); END IF;
  IF s.approver_scope='specific_user' THEN RETURN s.approver_user_id=p_user_id; END IF;
  IF c.company_id IS NULL THEN RETURN false; END IF;
  IF s.approver_scope='company_member' THEN
    RETURN EXISTS(SELECT 1 FROM public.nexus_company_members m WHERE m.company_id=c.company_id AND m.user_id=p_user_id AND m.active IS TRUE);
  END IF;
  IF s.approver_scope='company_role' THEN
    RETURN EXISTS(SELECT 1 FROM public.nexus_company_members m WHERE m.company_id=c.company_id AND m.user_id=p_user_id AND m.active IS TRUE AND m.member_role=s.approver_role);
  END IF;
  RETURN false;
END
$function$;
REVOKE ALL ON FUNCTION private.nexus_user_can_approve_step(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.nexus_user_can_approve_step(uuid,uuid) TO service_role;

CREATE OR REPLACE FUNCTION private.nexus_notify_approval_step(p_step_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE s public.nexus_approval_chain_steps%rowtype; c public.nexus_approval_chains%rowtype; u record; v_action text;
BEGIN
  SELECT * INTO s FROM public.nexus_approval_chain_steps WHERE id=p_step_id;
  IF s.id IS NULL OR s.status<>'pending' THEN RETURN; END IF;
  SELECT * INTO c FROM public.nexus_approval_chains WHERE id=s.chain_id;
  IF c.id IS NULL THEN RETURN; END IF;
  v_action:='/portal?view=inbox&approval_chain='||c.id::text;
  FOR u IN
    SELECT user_id FROM public.nexus_platform_admins WHERE s.approver_scope='platform_admin'
    UNION
    SELECT m.user_id FROM public.nexus_company_members m
      WHERE c.company_id IS NOT NULL AND m.company_id=c.company_id AND m.active IS TRUE
        AND s.approver_scope='company_member'
    UNION
    SELECT m.user_id FROM public.nexus_company_members m
      WHERE c.company_id IS NOT NULL AND m.company_id=c.company_id AND m.active IS TRUE
        AND s.approver_scope='company_role' AND m.member_role=s.approver_role
    UNION
    SELECT s.approver_user_id WHERE s.approver_scope='specific_user' AND s.approver_user_id IS NOT NULL
  LOOP
    IF NOT EXISTS(
      SELECT 1 FROM public.nexus_notifications n
      WHERE n.user_id=u.user_id AND n.related_type='approval_step' AND n.related_id=s.id AND n.read_at IS NULL
    ) THEN
      INSERT INTO public.nexus_notifications(company_id,user_id,notification_type,title,message,related_type,related_id,created_by,action_url)
      VALUES(c.company_id,u.user_id,'approval_required','Approval required — '||c.title,
        'Step '||s.step_order::text||': '||s.step_name||'. Review the record, add a decision note if needed, and approve, request changes, or reject.',
        'approval_step',s.id,c.requested_by,v_action);
    END IF;
  END LOOP;
END
$function$;
REVOKE ALL ON FUNCTION private.nexus_notify_approval_step(uuid) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.nexus_create_approval_chain(
  p_company_id uuid,
  p_project_id uuid,
  p_title text,
  p_description text,
  p_approval_type text,
  p_entity_type text,
  p_entity_id uuid,
  p_visibility text,
  p_steps jsonb,
  p_due_at timestamptz DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb,
  p_start boolean DEFAULT true
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE v_id uuid; item jsonb; n integer:=0; v_scope text;
BEGIN
  IF NOT public.nexus_is_platform_admin() THEN RAISE EXCEPTION 'Nexus administrator access required'; END IF;
  IF nullif(btrim(p_title),'') IS NULL THEN RAISE EXCEPTION 'Approval title is required'; END IF;
  IF p_visibility NOT IN ('internal','company') THEN RAISE EXCEPTION 'Invalid approval visibility'; END IF;
  IF p_visibility='company' AND p_company_id IS NULL THEN RAISE EXCEPTION 'Company-visible approvals require a company'; END IF;
  IF jsonb_typeof(p_steps)<>'array' OR jsonb_array_length(p_steps)<1 OR jsonb_array_length(p_steps)>20 THEN RAISE EXCEPTION 'Approval chain requires 1 to 20 steps'; END IF;
  IF p_project_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.nexus_projects p WHERE p.id=p_project_id AND (p_company_id IS NULL OR p.company_id=p_company_id)) THEN RAISE EXCEPTION 'Project does not belong to this company'; END IF;

  IF p_entity_type IS NOT NULL AND p_entity_id IS NOT NULL THEN
    SELECT id INTO v_id FROM public.nexus_approval_chains
    WHERE entity_type=p_entity_type AND entity_id=p_entity_id AND approval_type=coalesce(nullif(btrim(p_approval_type),''),'general')
      AND status IN ('draft','pending','changes_requested')
    ORDER BY created_at DESC LIMIT 1;
    IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  END IF;

  INSERT INTO public.nexus_approval_chains(company_id,project_id,title,description,approval_type,entity_type,entity_id,visibility,status,current_step,requested_by,due_at,metadata)
  VALUES(p_company_id,p_project_id,btrim(p_title),nullif(btrim(coalesce(p_description,'')),''),coalesce(nullif(btrim(p_approval_type),''),'general'),p_entity_type,p_entity_id,p_visibility,'draft',0,auth.uid(),p_due_at,coalesce(p_metadata,'{}'::jsonb))
  RETURNING id INTO v_id;

  FOR item IN SELECT * FROM jsonb_array_elements(p_steps) LOOP
    n:=n+1; v_scope:=coalesce(nullif(item->>'approver_scope',''),'platform_admin');
    IF v_scope NOT IN ('platform_admin','company_member','company_role','specific_user') THEN RAISE EXCEPTION 'Invalid approver scope at step %',n; END IF;
    INSERT INTO public.nexus_approval_chain_steps(chain_id,step_order,step_name,instructions,approver_scope,approver_role,approver_user_id,due_at)
    VALUES(v_id,n,coalesce(nullif(btrim(item->>'step_name'),''),'Approval step '||n::text),nullif(btrim(coalesce(item->>'instructions','')),''),v_scope,nullif(btrim(coalesce(item->>'approver_role','')),''),nullif(item->>'approver_user_id','')::uuid,coalesce((item->>'due_at')::timestamptz,p_due_at));
  END LOOP;

  INSERT INTO public.nexus_approval_events(chain_id,company_id,event_type,actor_id,note,payload)
  VALUES(v_id,p_company_id,'created',auth.uid(),'Approval chain created.',jsonb_build_object('steps',n,'approval_type',coalesce(p_approval_type,'general')));
  IF p_start THEN PERFORM public.nexus_start_approval_chain(v_id); END IF;
  RETURN v_id;
END
$function$;

CREATE OR REPLACE FUNCTION public.nexus_start_approval_chain(p_chain_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE c public.nexus_approval_chains%rowtype; s public.nexus_approval_chain_steps%rowtype;
BEGIN
  IF NOT public.nexus_is_platform_admin() THEN RAISE EXCEPTION 'Nexus administrator access required'; END IF;
  SELECT * INTO c FROM public.nexus_approval_chains WHERE id=p_chain_id FOR UPDATE;
  IF c.id IS NULL THEN RAISE EXCEPTION 'Approval chain not found'; END IF;
  IF c.status='pending' THEN RETURN c.id; END IF;
  IF c.status<>'draft' THEN RAISE EXCEPTION 'Only a draft approval chain can be started'; END IF;
  SELECT * INTO s FROM public.nexus_approval_chain_steps WHERE chain_id=c.id ORDER BY step_order LIMIT 1 FOR UPDATE;
  IF s.id IS NULL THEN RAISE EXCEPTION 'Approval chain has no steps'; END IF;
  UPDATE public.nexus_approval_chain_steps SET status='pending',updated_at=now() WHERE id=s.id;
  UPDATE public.nexus_approval_chains SET status='pending',current_step=s.step_order,started_at=coalesce(started_at,now()),updated_at=now() WHERE id=c.id;
  INSERT INTO public.nexus_approval_events(chain_id,step_id,company_id,event_type,actor_id,note) VALUES(c.id,s.id,c.company_id,'submitted',auth.uid(),'Approval chain submitted to step 1.');
  PERFORM private.nexus_notify_approval_step(s.id);
  RETURN c.id;
END
$function$;

CREATE OR REPLACE FUNCTION private.nexus_apply_approval_completion(p_chain_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE c public.nexus_approval_chains%rowtype;
BEGIN
  SELECT * INTO c FROM public.nexus_approval_chains WHERE id=p_chain_id;
  IF c.id IS NULL OR c.status<>'approved' OR c.entity_id IS NULL THEN RETURN; END IF;
  IF c.entity_type='legacy_approval' THEN
    UPDATE public.nexus_approvals SET status='approved',decided_by=auth.uid(),decided_at=now(),updated_at=now() WHERE id=c.entity_id;
  ELSIF c.entity_type='client_task_release' THEN
    PERFORM public.nexus_release_client_task(c.entity_id);
  ELSIF c.entity_type='document_request_release' THEN
    PERFORM public.nexus_release_document_request(c.entity_id);
  ELSIF c.entity_type='diagnosis_report_release' THEN
    PERFORM public.nexus_release_diagnosis_report(c.entity_id);
  ELSIF c.entity_type='outreach_packet' THEN
    PERFORM public.nexus_admin_approve_outreach_packet(c.entity_id);
  ELSIF c.entity_type='outreach_step' THEN
    PERFORM public.nexus_admin_approve_outreach_step(c.entity_id);
  END IF;
END
$function$;
REVOKE ALL ON FUNCTION private.nexus_apply_approval_completion(uuid) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.nexus_decide_approval_step(p_step_id uuid,p_decision text,p_note text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE s public.nexus_approval_chain_steps%rowtype; c public.nexus_approval_chains%rowtype; nxt public.nexus_approval_chain_steps%rowtype; v_decision text:=lower(btrim(coalesce(p_decision,'')));
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF v_decision NOT IN ('approved','changes_requested','rejected') THEN RAISE EXCEPTION 'Decision must be approved, changes_requested, or rejected'; END IF;
  IF v_decision IN ('changes_requested','rejected') AND nullif(btrim(coalesce(p_note,'')),'') IS NULL THEN RAISE EXCEPTION 'A decision note is required'; END IF;
  SELECT * INTO s FROM public.nexus_approval_chain_steps WHERE id=p_step_id FOR UPDATE;
  IF s.id IS NULL THEN RAISE EXCEPTION 'Approval step not found'; END IF;
  SELECT * INTO c FROM public.nexus_approval_chains WHERE id=s.chain_id FOR UPDATE;
  IF c.id IS NULL OR c.status<>'pending' OR s.status<>'pending' OR c.current_step<>s.step_order THEN RAISE EXCEPTION 'This approval step is not currently actionable'; END IF;
  IF NOT private.nexus_user_can_approve_step(s.id,auth.uid()) THEN RAISE EXCEPTION 'You are not the assigned approver for this step'; END IF;

  UPDATE public.nexus_approval_chain_steps SET status=v_decision,decided_by=auth.uid(),decision_note=nullif(btrim(coalesce(p_note,'')),''),decided_at=now(),updated_at=now() WHERE id=s.id;
  UPDATE public.nexus_notifications SET read_at=coalesce(read_at,now()) WHERE user_id=auth.uid() AND related_type='approval_step' AND related_id=s.id;
  INSERT INTO public.nexus_approval_events(chain_id,step_id,company_id,event_type,actor_id,note,payload)
  VALUES(c.id,s.id,c.company_id,v_decision,auth.uid(),nullif(btrim(coalesce(p_note,'')),''),jsonb_build_object('step_order',s.step_order,'revision_round',s.revision_round));

  IF v_decision='approved' THEN
    SELECT * INTO nxt FROM public.nexus_approval_chain_steps WHERE chain_id=c.id AND step_order>s.step_order AND status='queued' ORDER BY step_order LIMIT 1 FOR UPDATE;
    IF nxt.id IS NOT NULL THEN
      UPDATE public.nexus_approval_chain_steps SET status='pending',updated_at=now() WHERE id=nxt.id;
      UPDATE public.nexus_approval_chains SET current_step=nxt.step_order,updated_at=now() WHERE id=c.id;
      PERFORM private.nexus_notify_approval_step(nxt.id);
    ELSE
      UPDATE public.nexus_approval_chains SET status='approved',completed_at=now(),updated_at=now() WHERE id=c.id;
      INSERT INTO public.nexus_approval_events(chain_id,company_id,event_type,actor_id,note) VALUES(c.id,c.company_id,'completed',auth.uid(),'All approval steps completed.');
      PERFORM private.nexus_apply_approval_completion(c.id);
      IF c.requested_by IS NOT NULL THEN
        INSERT INTO public.nexus_notifications(company_id,user_id,notification_type,title,message,related_type,related_id,created_by,action_url)
        VALUES(c.company_id,c.requested_by,'approval_complete','Approved — '||c.title,'The approval chain completed all required review steps.','approval_chain',c.id,auth.uid(),'/portal?view=inbox&approval_chain='||c.id::text);
      END IF;
    END IF;
  ELSE
    UPDATE public.nexus_approval_chains SET status=v_decision,updated_at=now(),completed_at=CASE WHEN v_decision='rejected' THEN now() ELSE NULL END WHERE id=c.id;
    IF c.entity_type='legacy_approval' THEN
      UPDATE public.nexus_approvals SET status=v_decision,decided_by=auth.uid(),decision_note=nullif(btrim(coalesce(p_note,'')),''),decided_at=now(),updated_at=now() WHERE id=c.entity_id;
    END IF;
    IF c.requested_by IS NOT NULL THEN
      INSERT INTO public.nexus_notifications(company_id,user_id,notification_type,title,message,related_type,related_id,created_by,action_url)
      VALUES(c.company_id,c.requested_by,'approval_'||v_decision,CASE WHEN v_decision='rejected' THEN 'Rejected — ' ELSE 'Changes requested — ' END||c.title,coalesce(nullif(btrim(p_note),''),'Review the approval chain for details.'),'approval_chain',c.id,auth.uid(),'/portal?view=inbox&approval_chain='||c.id::text);
    END IF;
  END IF;
  RETURN c.id;
END
$function$;

CREATE OR REPLACE FUNCTION public.nexus_resubmit_approval_chain(p_chain_id uuid,p_note text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE c public.nexus_approval_chains%rowtype; s public.nexus_approval_chain_steps%rowtype;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT * INTO c FROM public.nexus_approval_chains WHERE id=p_chain_id FOR UPDATE;
  IF c.id IS NULL OR c.status<>'changes_requested' THEN RAISE EXCEPTION 'Only a changes-requested chain can be resubmitted'; END IF;
  IF auth.uid()<>c.requested_by AND NOT public.nexus_is_platform_admin() THEN RAISE EXCEPTION 'Only the requester or Nexus administrator can resubmit this approval'; END IF;
  SELECT * INTO s FROM public.nexus_approval_chain_steps WHERE chain_id=c.id AND status='changes_requested' ORDER BY step_order DESC LIMIT 1 FOR UPDATE;
  IF s.id IS NULL THEN RAISE EXCEPTION 'Changes-requested step not found'; END IF;
  UPDATE public.nexus_approval_chain_steps SET status='pending',revision_round=revision_round+1,decided_by=NULL,decision_note=NULL,decided_at=NULL,updated_at=now() WHERE id=s.id;
  UPDATE public.nexus_approval_chain_steps SET status='queued',decided_by=NULL,decision_note=NULL,decided_at=NULL,updated_at=now() WHERE chain_id=c.id AND step_order>s.step_order;
  UPDATE public.nexus_approval_chains SET status='pending',current_step=s.step_order,completed_at=NULL,updated_at=now() WHERE id=c.id;
  IF c.entity_type='legacy_approval' THEN UPDATE public.nexus_approvals SET status='pending',decided_by=NULL,decision_note=NULL,decided_at=NULL,updated_at=now() WHERE id=c.entity_id; END IF;
  INSERT INTO public.nexus_approval_events(chain_id,step_id,company_id,event_type,actor_id,note) VALUES(c.id,s.id,c.company_id,'resubmitted',auth.uid(),nullif(btrim(coalesce(p_note,'')),''));
  PERFORM private.nexus_notify_approval_step(s.id);
  RETURN c.id;
END
$function$;

CREATE OR REPLACE FUNCTION public.nexus_cancel_approval_chain(p_chain_id uuid,p_note text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE c public.nexus_approval_chains%rowtype;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT * INTO c FROM public.nexus_approval_chains WHERE id=p_chain_id FOR UPDATE;
  IF c.id IS NULL OR c.status IN ('approved','rejected','cancelled') THEN RAISE EXCEPTION 'Approval chain cannot be cancelled'; END IF;
  IF auth.uid()<>c.requested_by AND NOT public.nexus_is_platform_admin() THEN RAISE EXCEPTION 'Only the requester or Nexus administrator can cancel this approval'; END IF;
  UPDATE public.nexus_approval_chains SET status='cancelled',cancelled_at=now(),updated_at=now() WHERE id=c.id;
  UPDATE public.nexus_approval_chain_steps SET status='cancelled',updated_at=now() WHERE chain_id=c.id AND status IN ('queued','pending');
  INSERT INTO public.nexus_approval_events(chain_id,company_id,event_type,actor_id,note) VALUES(c.id,c.company_id,'cancelled',auth.uid(),nullif(btrim(coalesce(p_note,'')),''));
  RETURN c.id;
END
$function$;

-- Generic admin helper for future proposals, scope changes, document reviews, external releases, etc.
CREATE OR REPLACE FUNCTION public.nexus_request_entity_approval(
  p_company_id uuid,p_project_id uuid,p_title text,p_description text,p_approval_type text,
  p_entity_type text,p_entity_id uuid,p_visibility text DEFAULT 'internal',p_steps jsonb DEFAULT '[{"step_name":"Nexus review","approver_scope":"platform_admin"}]'::jsonb,p_due_at timestamptz DEFAULT NULL
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
BEGIN
  RETURN public.nexus_create_approval_chain(p_company_id,p_project_id,p_title,p_description,p_approval_type,p_entity_type,p_entity_id,p_visibility,p_steps,p_due_at,'{}'::jsonb,true);
END
$function$;

-- Legacy client-decision records become company-visible approval chains.
CREATE OR REPLACE FUNCTION private.nexus_attach_legacy_approval_chain()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
DECLARE cid uuid;
BEGIN
  IF NEW.approval_chain_id IS NOT NULL THEN RETURN NEW; END IF;
  INSERT INTO public.nexus_approval_chains(company_id,project_id,title,description,approval_type,entity_type,entity_id,visibility,status,current_step,requested_by,due_at)
  VALUES(NEW.company_id,NEW.project_id,NEW.title,NEW.description,coalesce(NEW.approval_type,'client_decision'),'legacy_approval',NEW.id,'company','draft',0,NEW.requested_by,CASE WHEN NEW.due_date IS NULL THEN NULL ELSE NEW.due_date::timestamptz END)
  RETURNING id INTO cid;
  INSERT INTO public.nexus_approval_chain_steps(chain_id,step_order,step_name,instructions,approver_scope,approver_role,due_at)
  VALUES(cid,1,'Client owner decision','Review the request and approve, request changes, or reject.','company_role','owner',CASE WHEN NEW.due_date IS NULL THEN NULL ELSE NEW.due_date::timestamptz END);
  UPDATE public.nexus_approvals SET approval_chain_id=cid WHERE id=NEW.id;
  INSERT INTO public.nexus_approval_events(chain_id,company_id,event_type,actor_id,note) VALUES(cid,NEW.company_id,'created',NEW.requested_by,'Client decision approval chain created.');
  IF NEW.status='pending' THEN PERFORM public.nexus_start_approval_chain(cid); END IF;
  RETURN NEW;
END
$function$;
DROP TRIGGER IF EXISTS nexus_attach_legacy_approval_chain ON public.nexus_approvals;
CREATE TRIGGER nexus_attach_legacy_approval_chain AFTER INSERT ON public.nexus_approvals FOR EACH ROW EXECUTE FUNCTION private.nexus_attach_legacy_approval_chain();

CREATE OR REPLACE FUNCTION private.nexus_create_internal_release_chain()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
DECLARE cid uuid; v_type text; v_title text; v_company uuid; v_project uuid; v_entity uuid; v_requested uuid;
BEGIN
  IF TG_TABLE_NAME='nexus_tasks' THEN
    IF NOT (NEW.assignee='client' AND NEW.status='draft') THEN RETURN NEW; END IF;
    v_type:='client_task_release';v_title:='Release client action — '||NEW.title;v_company:=NEW.company_id;v_project:=NEW.project_id;v_entity:=NEW.id;v_requested:=NEW.created_by;
  ELSIF TG_TABLE_NAME='nexus_document_requests' THEN
    IF NEW.status<>'draft' THEN RETURN NEW; END IF;
    v_type:='document_request_release';v_title:='Release document request — '||NEW.title;v_company:=NEW.company_id;v_project:=NEW.project_id;v_entity:=NEW.id;v_requested:=NEW.requested_by;
  ELSIF TG_TABLE_NAME='nexus_diagnosis_runs' THEN
    IF NEW.status<>'approved' OR NEW.analysis_result IS NULL OR (TG_OP='UPDATE' AND OLD.status='approved') THEN RETURN NEW; END IF;
    IF EXISTS(SELECT 1 FROM public.nexus_diagnosis_report_releases r WHERE r.diagnosis_run_id=NEW.id AND r.status='released') THEN RETURN NEW; END IF;
    v_type:='diagnosis_report_release';v_title:='Release diagnosis report to client';v_company:=NEW.company_id;v_project:=NEW.project_id;v_entity:=NEW.id;v_requested:=coalesce(NEW.approved_by,auth.uid());
  ELSE RETURN NEW; END IF;
  IF EXISTS(SELECT 1 FROM public.nexus_approval_chains c WHERE c.entity_type=v_type AND c.entity_id=v_entity AND c.status IN ('draft','pending','changes_requested','approved')) THEN RETURN NEW; END IF;
  INSERT INTO public.nexus_approval_chains(company_id,project_id,title,approval_type,entity_type,entity_id,visibility,status,current_step,requested_by,started_at)
  VALUES(v_company,v_project,v_title,'external_release',v_type,v_entity,'internal','pending',1,coalesce(v_requested,auth.uid()),now()) RETURNING id INTO cid;
  INSERT INTO public.nexus_approval_chain_steps(chain_id,step_order,step_name,instructions,approver_scope,status)
  VALUES(cid,1,'Nexus release review','Confirm wording, scope, recipient visibility, and downstream consequence before release.','platform_admin','pending');
  INSERT INTO public.nexus_approval_events(chain_id,company_id,event_type,actor_id,note) VALUES(cid,v_company,'submitted',coalesce(v_requested,auth.uid()),'Release approval created automatically.');
  PERFORM private.nexus_notify_approval_step((SELECT id FROM public.nexus_approval_chain_steps WHERE chain_id=cid AND step_order=1));
  RETURN NEW;
END
$function$;
DROP TRIGGER IF EXISTS nexus_task_release_chain ON public.nexus_tasks;
CREATE TRIGGER nexus_task_release_chain AFTER INSERT OR UPDATE OF status ON public.nexus_tasks FOR EACH ROW EXECUTE FUNCTION private.nexus_create_internal_release_chain();
DROP TRIGGER IF EXISTS nexus_document_request_release_chain ON public.nexus_document_requests;
CREATE TRIGGER nexus_document_request_release_chain AFTER INSERT OR UPDATE OF status ON public.nexus_document_requests FOR EACH ROW EXECUTE FUNCTION private.nexus_create_internal_release_chain();
DROP TRIGGER IF EXISTS nexus_diagnosis_report_release_chain ON public.nexus_diagnosis_runs;
CREATE TRIGGER nexus_diagnosis_report_release_chain AFTER INSERT OR UPDATE OF status ON public.nexus_diagnosis_runs FOR EACH ROW EXECUTE FUNCTION private.nexus_create_internal_release_chain();

CREATE OR REPLACE FUNCTION private.nexus_create_revenue_approval_chain()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
DECLARE cid uuid; v_type text; v_title text; v_entity uuid;
BEGIN
  IF TG_TABLE_NAME='nexus_outreach_packets' THEN
    IF NEW.status<>'pending_review' OR NEW.qa_status<>'passed' THEN RETURN NEW; END IF;
    v_type:='outreach_packet';v_title:='Approve outreach packet';v_entity:=NEW.id;
  ELSE
    IF NEW.status<>'pending_approval' THEN RETURN NEW; END IF;
    v_type:='outreach_step';v_title:='Approve outreach step '||NEW.step_no::text;v_entity:=NEW.id;
  END IF;
  IF EXISTS(SELECT 1 FROM public.nexus_approval_chains c WHERE c.entity_type=v_type AND c.entity_id=v_entity AND c.status IN ('draft','pending','changes_requested','approved')) THEN RETURN NEW; END IF;
  INSERT INTO public.nexus_approval_chains(title,description,approval_type,entity_type,entity_id,visibility,status,current_step,requested_by,started_at,metadata)
  VALUES(v_title,'Human approval required before any prospect-facing outreach becomes send-ready.','revenue_outreach',v_type,v_entity,'internal','pending',1,auth.uid(),now(),jsonb_build_object('lead_id',NEW.lead_id)) RETURNING id INTO cid;
  INSERT INTO public.nexus_approval_chain_steps(chain_id,step_order,step_name,instructions,approver_scope,status)
  VALUES(cid,1,'Founder review','Verify evidence, claims, tone, compliance, and send-readiness.','platform_admin','pending');
  INSERT INTO public.nexus_approval_events(chain_id,event_type,actor_id,note) VALUES(cid,'submitted',auth.uid(),'Revenue approval created automatically.');
  PERFORM private.nexus_notify_approval_step((SELECT id FROM public.nexus_approval_chain_steps WHERE chain_id=cid AND step_order=1));
  RETURN NEW;
END
$function$;
DROP TRIGGER IF EXISTS nexus_outreach_packet_approval_chain ON public.nexus_outreach_packets;
CREATE TRIGGER nexus_outreach_packet_approval_chain AFTER INSERT OR UPDATE OF status,qa_status ON public.nexus_outreach_packets FOR EACH ROW EXECUTE FUNCTION private.nexus_create_revenue_approval_chain();
DROP TRIGGER IF EXISTS nexus_outreach_step_approval_chain ON public.nexus_outreach_sequence_steps;
CREATE TRIGGER nexus_outreach_step_approval_chain AFTER INSERT OR UPDATE OF status ON public.nexus_outreach_sequence_steps FOR EACH ROW EXECUTE FUNCTION private.nexus_create_revenue_approval_chain();

-- Release/approval RPCs are now chain-gated whenever a chain exists.
CREATE OR REPLACE FUNCTION private.nexus_require_entity_chain_approved(p_entity_type text,p_entity_id uuid)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO '' AS $function$
DECLARE st text;
BEGIN
  SELECT status INTO st FROM public.nexus_approval_chains WHERE entity_type=p_entity_type AND entity_id=p_entity_id ORDER BY created_at DESC LIMIT 1;
  IF st IS NOT NULL AND st<>'approved' THEN RAISE EXCEPTION 'Approval chain must be completed before this action'; END IF;
END
$function$;
REVOKE ALL ON FUNCTION private.nexus_require_entity_chain_approved(text,uuid) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.nexus_release_client_task(p_task_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
DECLARE t public.nexus_tasks%rowtype;
BEGIN
  IF NOT public.nexus_is_platform_admin() THEN RAISE EXCEPTION 'Nexus administrator access required'; END IF;
  SELECT * INTO t FROM public.nexus_tasks WHERE id=p_task_id FOR UPDATE; IF t.id IS NULL THEN RAISE EXCEPTION 'Task not found'; END IF;
  IF t.assignee<>'client' THEN RAISE EXCEPTION 'Only client tasks can be released to the client'; END IF;
  PERFORM private.nexus_require_entity_chain_approved('client_task_release',t.id);
  IF t.status='draft' THEN UPDATE public.nexus_tasks SET status='waiting_on_client',notify_client=true,updated_at=now() WHERE id=t.id;
  ELSIF t.notify_client IS FALSE THEN UPDATE public.nexus_tasks SET notify_client=true,updated_at=now() WHERE id=t.id; END IF;
  RETURN t.id;
END
$function$;

CREATE OR REPLACE FUNCTION public.nexus_release_document_request(p_request_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
DECLARE r public.nexus_document_requests%rowtype;
BEGIN
  IF NOT public.nexus_is_platform_admin() THEN RAISE EXCEPTION 'Nexus administrator access required'; END IF;
  SELECT * INTO r FROM public.nexus_document_requests WHERE id=p_request_id FOR UPDATE; IF r.id IS NULL THEN RAISE EXCEPTION 'Document request not found'; END IF;
  PERFORM private.nexus_require_entity_chain_approved('document_request_release',r.id);
  IF r.status='draft' THEN UPDATE public.nexus_document_requests SET status='requested',updated_at=now() WHERE id=r.id; END IF;
  RETURN r.id;
END
$function$;

CREATE OR REPLACE FUNCTION public.nexus_release_approval(p_approval_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
DECLARE a public.nexus_approvals%rowtype;
BEGIN
  IF NOT public.nexus_is_platform_admin() THEN RAISE EXCEPTION 'Nexus administrator access required'; END IF;
  SELECT * INTO a FROM public.nexus_approvals WHERE id=p_approval_id FOR UPDATE; IF a.id IS NULL THEN RAISE EXCEPTION 'Approval not found'; END IF;
  IF a.status='draft' THEN UPDATE public.nexus_approvals SET status='pending',updated_at=now() WHERE id=a.id; END IF;
  IF a.approval_chain_id IS NOT NULL THEN PERFORM public.nexus_start_approval_chain(a.approval_chain_id); END IF;
  RETURN a.id;
END
$function$;

-- Prevent the old direct client UPDATE path from bypassing the chain.
DROP POLICY IF EXISTS "nexus members decide approvals" ON public.nexus_approvals;
DROP POLICY IF EXISTS "nexus admins update approvals" ON public.nexus_approvals;
CREATE POLICY "nexus admins update approvals" ON public.nexus_approvals
FOR UPDATE TO authenticated USING (public.nexus_is_platform_admin()) WITH CHECK (public.nexus_is_platform_admin());

-- Unified Inbox: one server-normalized queue for actions, approvals, questions, document requests and updates.
CREATE OR REPLACE FUNCTION public.nexus_get_inbox(p_company_id uuid DEFAULT NULL)
RETURNS TABLE(
  item_key text,kind text,company_id uuid,company_name text,title text,message text,status text,priority text,
  due_at timestamptz,created_at timestamptz,action_url text,related_type text,related_id uuid,
  approval_chain_id uuid,approval_step_id uuid,step_order integer,step_count integer,can_approve boolean,is_unread boolean
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
DECLARE v_admin boolean:=public.nexus_is_platform_admin(); v_user uuid:=auth.uid();
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF NOT v_admin AND p_company_id IS NULL THEN RAISE EXCEPTION 'Company is required'; END IF;
  IF NOT v_admin AND NOT public.nexus_is_company_member(p_company_id) THEN RAISE EXCEPTION 'Company membership required'; END IF;

  RETURN QUERY
  WITH visible_chains AS (
    SELECT c.* FROM public.nexus_approval_chains c
    WHERE c.status IN ('pending','changes_requested')
      AND (v_admin OR (c.visibility='company' AND c.company_id=p_company_id AND public.nexus_is_company_member(c.company_id)))
      AND (p_company_id IS NULL OR c.company_id=p_company_id OR (v_admin AND c.company_id IS NULL))
  ), pending_steps AS (
    SELECT s.*,c.company_id,c.title chain_title,c.description chain_description,c.status chain_status,c.id chainid,co.name company_name,
      (SELECT count(*)::int FROM public.nexus_approval_chain_steps x WHERE x.chain_id=c.id) step_count
    FROM visible_chains c JOIN public.nexus_approval_chain_steps s ON s.chain_id=c.id AND s.status='pending'
    LEFT JOIN public.nexus_companies co ON co.id=c.company_id
  )
  SELECT 'approval:'||ps.id::text,'approval'::text,ps.company_id,ps.company_name,ps.chain_title,
    coalesce(ps.chain_description,ps.instructions,'Approval is waiting for review.'),ps.chain_status,
    CASE WHEN ps.due_at IS NOT NULL AND ps.due_at<now() THEN 'high' ELSE 'normal' END,
    ps.due_at,ps.created_at,'/portal?view=inbox&approval_chain='||ps.chainid::text,'approval_chain',ps.chainid,
    ps.chainid,ps.id,ps.step_order,ps.step_count,private.nexus_user_can_approve_step(ps.id,v_user),false
  FROM pending_steps ps

  UNION ALL
  SELECT 'task:'||t.id::text,'task',t.company_id,co.name,t.title,coalesce(t.description,'Action item requires attention.'),t.status,t.priority,
    CASE WHEN t.due_date IS NULL THEN NULL ELSE t.due_date::timestamptz END,t.created_at,'/portal?view=inbox&task='||t.id::text,'task',t.id,NULL,NULL,NULL,NULL,
    CASE WHEN v_admin THEN t.status='ready_for_review' OR t.assignee='nexus' ELSE t.assignee='client' END,false
  FROM public.nexus_tasks t JOIN public.nexus_companies co ON co.id=t.company_id
  WHERE t.status NOT IN ('done','completed','not_applicable','draft')
    AND (p_company_id IS NULL OR t.company_id=p_company_id)
    AND (v_admin OR (t.company_id=p_company_id AND public.nexus_is_company_member(t.company_id) AND t.assignee='client'))
    AND (CASE WHEN v_admin THEN (t.status='ready_for_review' OR t.assignee='nexus') ELSE true END)

  UNION ALL
  SELECT 'document_request:'||d.id::text,'document_request',d.company_id,co.name,d.title,coalesce(d.purpose,'Nexus requested supporting evidence.'),d.status,'normal',
    CASE WHEN d.due_date IS NULL THEN NULL ELSE d.due_date::timestamptz END,d.created_at,'/portal?view=inbox&document_request='||d.id::text,'document_request',d.id,NULL,NULL,NULL,NULL,
    NOT v_admin,false
  FROM public.nexus_document_requests d JOIN public.nexus_companies co ON co.id=d.company_id
  WHERE d.status='requested' AND (p_company_id IS NULL OR d.company_id=p_company_id)
    AND (v_admin OR (d.company_id=p_company_id AND public.nexus_is_company_member(d.company_id)))

  UNION ALL
  SELECT 'question:'||q.id::text,'question',q.company_id,co.name,'Diagnosis report question',q.question,q.status,'normal',NULL,q.created_at,
    '/portal?view=diagnosis-question&question='||q.id::text,'diagnosis_report_question',q.id,NULL,NULL,NULL,NULL,v_admin,false
  FROM public.nexus_diagnosis_report_questions q JOIN public.nexus_companies co ON co.id=q.company_id
  WHERE q.status='open' AND (p_company_id IS NULL OR q.company_id=p_company_id)
    AND (v_admin OR (q.company_id=p_company_id AND public.nexus_is_company_member(q.company_id) AND q.asked_by=v_user))

  UNION ALL
  SELECT 'notification:'||n.id::text,'update',n.company_id,co.name,n.title,coalesce(n.message,''),'unread','normal',NULL,n.created_at,
    coalesce(n.action_url,'/portal?view=inbox'),'notification',n.id,NULL,NULL,NULL,NULL,false,true
  FROM public.nexus_notifications n LEFT JOIN public.nexus_companies co ON co.id=n.company_id
  WHERE n.read_at IS NULL AND (n.user_id IS NULL OR n.user_id=v_user)
    AND (p_company_id IS NULL OR n.company_id=p_company_id)
    AND (v_admin OR (n.company_id=p_company_id AND public.nexus_is_company_member(n.company_id)))

  UNION ALL
  SELECT 'founder:'||f.id::text,'founder_decision',NULL,NULL,f.title,coalesce(f.context,f.recommended_action,''),f.status,f.priority,f.due_at,f.created_at,
    '/portal?view=revenue-engine&decision='||f.id::text,'founder_decision',f.id,NULL,NULL,NULL,NULL,v_admin,false
  FROM public.nexus_founder_decision_queue f
  WHERE v_admin AND p_company_id IS NULL AND f.status='open'

  ORDER BY priority DESC NULLS LAST,due_at ASC NULLS LAST,created_at DESC;
END
$function$;

REVOKE ALL ON FUNCTION public.nexus_create_approval_chain(uuid,uuid,text,text,text,text,uuid,text,jsonb,timestamptz,jsonb,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.nexus_create_approval_chain(uuid,uuid,text,text,text,text,uuid,text,jsonb,timestamptz,jsonb,boolean) TO authenticated,service_role;
REVOKE ALL ON FUNCTION public.nexus_start_approval_chain(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.nexus_start_approval_chain(uuid) TO authenticated,service_role;
REVOKE ALL ON FUNCTION public.nexus_decide_approval_step(uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.nexus_decide_approval_step(uuid,text,text) TO authenticated,service_role;
REVOKE ALL ON FUNCTION public.nexus_resubmit_approval_chain(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.nexus_resubmit_approval_chain(uuid,text) TO authenticated,service_role;
REVOKE ALL ON FUNCTION public.nexus_cancel_approval_chain(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.nexus_cancel_approval_chain(uuid,text) TO authenticated,service_role;
REVOKE ALL ON FUNCTION public.nexus_request_entity_approval(uuid,uuid,text,text,text,text,uuid,text,jsonb,timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.nexus_request_entity_approval(uuid,uuid,text,text,text,text,uuid,text,jsonb,timestamptz) TO authenticated,service_role;
REVOKE ALL ON FUNCTION public.nexus_get_inbox(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.nexus_get_inbox(uuid) TO authenticated,service_role;

-- Backfill current actionable records into the chain system without changing their existing state.
DO $backfill$
DECLARE r record; cid uuid;
BEGIN
  FOR r IN SELECT a.* FROM public.nexus_approvals a WHERE a.approval_chain_id IS NULL LOOP
    INSERT INTO public.nexus_approval_chains(company_id,project_id,title,description,approval_type,entity_type,entity_id,visibility,status,current_step,requested_by,due_at,started_at)
    VALUES(r.company_id,r.project_id,r.title,r.description,coalesce(r.approval_type,'client_decision'),'legacy_approval',r.id,'company',CASE WHEN r.status='draft' THEN 'draft' WHEN r.status='pending' THEN 'pending' ELSE r.status END,CASE WHEN r.status='pending' THEN 1 ELSE 0 END,r.requested_by,CASE WHEN r.due_date IS NULL THEN NULL ELSE r.due_date::timestamptz END,CASE WHEN r.status='pending' THEN r.updated_at ELSE NULL END)
    RETURNING id INTO cid;
    INSERT INTO public.nexus_approval_chain_steps(chain_id,step_order,step_name,approver_scope,approver_role,status,due_at)
    VALUES(cid,1,'Client owner decision','company_role','owner',CASE WHEN r.status='pending' THEN 'pending' WHEN r.status='approved' THEN 'approved' WHEN r.status='changes_requested' THEN 'changes_requested' ELSE 'queued' END,CASE WHEN r.due_date IS NULL THEN NULL ELSE r.due_date::timestamptz END);
    UPDATE public.nexus_approvals SET approval_chain_id=cid WHERE id=r.id;
  END LOOP;

  FOR r IN SELECT t.* FROM public.nexus_tasks t WHERE t.assignee='client' AND t.status='draft' LOOP
    IF NOT EXISTS(SELECT 1 FROM public.nexus_approval_chains c WHERE c.entity_type='client_task_release' AND c.entity_id=r.id AND c.status IN ('draft','pending','changes_requested','approved')) THEN
      INSERT INTO public.nexus_approval_chains(company_id,project_id,title,approval_type,entity_type,entity_id,visibility,status,current_step,requested_by,started_at)
      VALUES(r.company_id,r.project_id,'Release client action — '||r.title,'external_release','client_task_release',r.id,'internal','pending',1,r.created_by,now()) RETURNING id INTO cid;
      INSERT INTO public.nexus_approval_chain_steps(chain_id,step_order,step_name,approver_scope,status) VALUES(cid,1,'Nexus release review','platform_admin','pending');
    END IF;
  END LOOP;

  FOR r IN SELECT d.* FROM public.nexus_document_requests d WHERE d.status='draft' LOOP
    IF NOT EXISTS(SELECT 1 FROM public.nexus_approval_chains c WHERE c.entity_type='document_request_release' AND c.entity_id=r.id AND c.status IN ('draft','pending','changes_requested','approved')) THEN
      INSERT INTO public.nexus_approval_chains(company_id,project_id,title,approval_type,entity_type,entity_id,visibility,status,current_step,requested_by,started_at)
      VALUES(r.company_id,r.project_id,'Release document request — '||r.title,'external_release','document_request_release',r.id,'internal','pending',1,r.requested_by,now()) RETURNING id INTO cid;
      INSERT INTO public.nexus_approval_chain_steps(chain_id,step_order,step_name,approver_scope,status) VALUES(cid,1,'Nexus release review','platform_admin','pending');
    END IF;
  END LOOP;

  FOR r IN SELECT d.* FROM public.nexus_diagnosis_runs d WHERE d.status='approved' AND d.analysis_result IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.nexus_diagnosis_report_releases x WHERE x.diagnosis_run_id=d.id AND x.status='released') LOOP
    IF NOT EXISTS(SELECT 1 FROM public.nexus_approval_chains c WHERE c.entity_type='diagnosis_report_release' AND c.entity_id=r.id AND c.status IN ('draft','pending','changes_requested','approved')) THEN
      INSERT INTO public.nexus_approval_chains(company_id,project_id,title,approval_type,entity_type,entity_id,visibility,status,current_step,requested_by,started_at)
      VALUES(r.company_id,r.project_id,'Release diagnosis report to client','external_release','diagnosis_report_release',r.id,'internal','pending',1,coalesce(r.approved_by,r.created_by),now()) RETURNING id INTO cid;
      INSERT INTO public.nexus_approval_chain_steps(chain_id,step_order,step_name,approver_scope,status) VALUES(cid,1,'Nexus release review','platform_admin','pending');
    END IF;
  END LOOP;

  FOR r IN SELECT p.* FROM public.nexus_outreach_packets p WHERE p.status='pending_review' AND p.qa_status='passed' LOOP
    IF NOT EXISTS(SELECT 1 FROM public.nexus_approval_chains c WHERE c.entity_type='outreach_packet' AND c.entity_id=r.id AND c.status IN ('draft','pending','changes_requested','approved')) THEN
      INSERT INTO public.nexus_approval_chains(title,description,approval_type,entity_type,entity_id,visibility,status,current_step,requested_by,started_at,metadata)
      VALUES('Approve outreach packet','Human review required before prospect-facing outreach becomes send-ready.','revenue_outreach','outreach_packet',r.id,'internal','pending',1,r.created_by,now(),jsonb_build_object('lead_id',r.lead_id)) RETURNING id INTO cid;
      INSERT INTO public.nexus_approval_chain_steps(chain_id,step_order,step_name,approver_scope,status) VALUES(cid,1,'Founder review','platform_admin','pending');
    END IF;
  END LOOP;

  FOR r IN SELECT s.* FROM public.nexus_outreach_sequence_steps s WHERE s.status='pending_approval' LOOP
    IF NOT EXISTS(SELECT 1 FROM public.nexus_approval_chains c WHERE c.entity_type='outreach_step' AND c.entity_id=r.id AND c.status IN ('draft','pending','changes_requested','approved')) THEN
      INSERT INTO public.nexus_approval_chains(title,description,approval_type,entity_type,entity_id,visibility,status,current_step,requested_by,started_at,metadata)
      VALUES('Approve outreach step '||r.step_no::text,'Human review required before this outreach step becomes send-ready.','revenue_outreach','outreach_step',r.id,'internal','pending',1,coalesce(r.created_by,(SELECT created_by FROM public.nexus_outreach_packets p WHERE p.id=r.packet_id)),now(),jsonb_build_object('lead_id',r.lead_id,'packet_id',r.packet_id)) RETURNING id INTO cid;
      INSERT INTO public.nexus_approval_chain_steps(chain_id,step_order,step_name,approver_scope,status) VALUES(cid,1,'Founder review','platform_admin','pending');
    END IF;
  END LOOP;
END
$backfill$;

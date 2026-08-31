-- Nexus vNext diagnosis release / Q&A / notification contract.
-- Additive migration. Internal nexus_diagnosis_runs remains admin-only.

CREATE TABLE IF NOT EXISTS public.nexus_diagnosis_report_releases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.nexus_companies(id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.nexus_projects(id) ON DELETE SET NULL,
  diagnosis_run_id uuid NOT NULL UNIQUE REFERENCES public.nexus_diagnosis_runs(id) ON DELETE CASCADE,
  client_report jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','released','revoked')),
  report_version integer NOT NULL DEFAULT 1,
  released_by uuid REFERENCES auth.users(id),
  released_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS nexus_diagnosis_report_releases_company_idx
  ON public.nexus_diagnosis_report_releases(company_id, released_at DESC);
CREATE INDEX IF NOT EXISTS nexus_diagnosis_report_releases_project_idx
  ON public.nexus_diagnosis_report_releases(project_id, released_at DESC);

ALTER TABLE public.nexus_diagnosis_report_releases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "nexus admins manage diagnosis report releases" ON public.nexus_diagnosis_report_releases;
CREATE POLICY "nexus admins manage diagnosis report releases"
ON public.nexus_diagnosis_report_releases
FOR ALL TO authenticated
USING (public.nexus_is_platform_admin())
WITH CHECK (public.nexus_is_platform_admin());

DROP POLICY IF EXISTS "nexus members view released diagnosis reports" ON public.nexus_diagnosis_report_releases;
CREATE POLICY "nexus members view released diagnosis reports"
ON public.nexus_diagnosis_report_releases
FOR SELECT TO authenticated
USING (
  status='released'
  AND public.nexus_is_company_member(company_id)
);

CREATE TABLE IF NOT EXISTS public.nexus_diagnosis_report_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  release_id uuid NOT NULL REFERENCES public.nexus_diagnosis_report_releases(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.nexus_companies(id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.nexus_projects(id) ON DELETE SET NULL,
  asked_by uuid NOT NULL REFERENCES auth.users(id),
  question text NOT NULL CHECK (char_length(btrim(question)) BETWEEN 2 AND 6000),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','answered','closed')),
  answer text,
  answered_by uuid REFERENCES auth.users(id),
  answered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS nexus_diagnosis_report_questions_release_idx
  ON public.nexus_diagnosis_report_questions(release_id, created_at);
CREATE INDEX IF NOT EXISTS nexus_diagnosis_report_questions_company_idx
  ON public.nexus_diagnosis_report_questions(company_id, status, created_at DESC);

ALTER TABLE public.nexus_diagnosis_report_questions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "nexus members view diagnosis report questions" ON public.nexus_diagnosis_report_questions;
CREATE POLICY "nexus members view diagnosis report questions"
ON public.nexus_diagnosis_report_questions
FOR SELECT TO authenticated
USING (public.nexus_is_platform_admin() OR public.nexus_is_company_member(company_id));

-- Inserts/answers are routed through constrained RPCs below so notifications and
-- channel delivery cannot be bypassed by a direct browser write.
DROP POLICY IF EXISTS "nexus admins manage diagnosis report questions" ON public.nexus_diagnosis_report_questions;
CREATE POLICY "nexus admins manage diagnosis report questions"
ON public.nexus_diagnosis_report_questions
FOR ALL TO authenticated
USING (public.nexus_is_platform_admin())
WITH CHECK (public.nexus_is_platform_admin());

CREATE TABLE IF NOT EXISTS public.nexus_sms_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.nexus_companies(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_phone text NOT NULL,
  message_kind text NOT NULL,
  body_text text NOT NULL,
  action_url text,
  related_type text,
  related_id uuid,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  dedupe_key text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','sending','sent','failed','unavailable')),
  attempts integer NOT NULL DEFAULT 0,
  available_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  provider_message_id text,
  last_error text,
  last_attempt_at timestamptz,
  provider_status text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS nexus_sms_outbox_delivery_idx
  ON public.nexus_sms_outbox(status, available_at, created_at);
ALTER TABLE public.nexus_sms_outbox ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "nexus admins view sms outbox" ON public.nexus_sms_outbox;
CREATE POLICY "nexus admins view sms outbox"
ON public.nexus_sms_outbox
FOR SELECT TO authenticated
USING (public.nexus_is_platform_admin());

ALTER TABLE public.nexus_notification_preferences
  ADD COLUMN IF NOT EXISTS report_emails boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS qa_emails boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS sms_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS report_sms boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS qa_sms boolean NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION public.nexus_client_report_projection(p_result jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $function$
  SELECT jsonb_build_object(
    'executive_summary', coalesce(p_result->'executive_summary','""'::jsonb),
    'facts', coalesce((
      SELECT jsonb_agg(jsonb_build_object('statement',x->>'statement'))
      FROM jsonb_array_elements(coalesce(p_result->'facts','[]'::jsonb)) x
    ),'[]'::jsonb),
    'client_statements', coalesce((
      SELECT jsonb_agg(jsonb_build_object('statement',x->>'statement'))
      FROM jsonb_array_elements(coalesce(p_result->'client_statements','[]'::jsonb)) x
    ),'[]'::jsonb),
    'process_map', coalesce((
      SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'step',x->'step','name',x->>'name','current_state',x->>'current_state','owner',x->>'owner','systems',x->'systems'
      )))
      FROM jsonb_array_elements(coalesce(p_result->'process_map','[]'::jsonb)) x
    ),'[]'::jsonb),
    'bottlenecks', coalesce((
      SELECT jsonb_agg(jsonb_build_object('title',x->>'title','description',x->>'description','impact',x->>'impact'))
      FROM jsonb_array_elements(coalesce(p_result->'bottlenecks','[]'::jsonb)) x
    ),'[]'::jsonb),
    'opportunity_backlog', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'rank',x->'rank','title',x->>'title','problem',x->>'problem','recommendation',x->>'recommendation',
        'value_score',x->'value_score','effort_score',x->'effort_score','readiness_score',x->'readiness_score'
      ) ORDER BY coalesce((x->>'rank')::int,999))
      FROM jsonb_array_elements(coalesce(p_result->'opportunity_backlog','[]'::jsonb)) x
    ),'[]'::jsonb),
    'follow_up_questions', coalesce(p_result->'follow_up_questions','[]'::jsonb),
    'smallest_safe_pilot', coalesce(p_result->'smallest_safe_pilot','{}'::jsonb),
    'client_action_items', coalesce(p_result->'client_action_items','[]'::jsonb)
  )
$function$;

REVOKE ALL ON FUNCTION public.nexus_client_report_projection(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.nexus_client_report_projection(jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.nexus_release_diagnosis_report(p_run_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_run public.nexus_diagnosis_runs%rowtype;
  v_release public.nexus_diagnosis_report_releases%rowtype;
  v_member record;
  v_pref public.nexus_notification_preferences%rowtype;
  v_email text;
  v_phone text;
  v_action text;
BEGIN
  IF NOT public.nexus_is_platform_admin() THEN
    RAISE EXCEPTION 'Nexus administrator access required';
  END IF;

  SELECT * INTO v_run
  FROM public.nexus_diagnosis_runs
  WHERE id=p_run_id
  FOR UPDATE;

  IF v_run.id IS NULL THEN RAISE EXCEPTION 'Diagnosis not found'; END IF;
  IF v_run.status <> 'approved' OR v_run.analysis_result IS NULL THEN
    RAISE EXCEPTION 'Only an approved diagnosis can be released';
  END IF;

  INSERT INTO public.nexus_diagnosis_report_releases(
    company_id,project_id,diagnosis_run_id,client_report,status,report_version,released_by,released_at,updated_at
  ) VALUES(
    v_run.company_id,v_run.project_id,v_run.id,public.nexus_client_report_projection(v_run.analysis_result),
    'released',1,auth.uid(),now(),now()
  )
  ON CONFLICT(diagnosis_run_id) DO UPDATE SET
    client_report=excluded.client_report,
    status='released',
    report_version=public.nexus_diagnosis_report_releases.report_version+1,
    released_by=auth.uid(),released_at=now(),revoked_at=null,updated_at=now()
  RETURNING * INTO v_release;

  v_action := '/portal?view=diagnosis-report&release='||v_release.id::text;

  FOR v_member IN
    SELECT m.user_id
    FROM public.nexus_company_members m
    WHERE m.company_id=v_run.company_id AND m.active IS TRUE
  LOOP
    INSERT INTO public.nexus_notifications(
      company_id,user_id,notification_type,title,message,related_type,related_id,created_by,action_url
    ) VALUES(
      v_run.company_id,v_member.user_id,'diagnosis_report',
      'Your Nexus diagnosis report is ready',
      'Nexus has released a client report for your review. Open it to review the findings and ask questions.',
      'diagnosis_report_release',v_release.id,auth.uid(),v_action
    );

    SELECT * INTO v_pref FROM public.nexus_notification_preferences
      WHERE company_id=v_run.company_id AND user_id=v_member.user_id;
    SELECT email INTO v_email FROM auth.users WHERE id=v_member.user_id;
    SELECT phone INTO v_phone FROM public.nexus_profiles WHERE user_id=v_member.user_id;

    IF v_email IS NOT NULL AND coalesce(v_pref.email_enabled,true) AND coalesce(v_pref.report_emails,true) THEN
      INSERT INTO public.nexus_email_outbox(
        company_id,user_id,recipient_email,message_kind,subject,body_text,action_url,related_type,related_id,dedupe_key
      ) VALUES(
        v_run.company_id,v_member.user_id,v_email,'diagnosis_report',
        'Your Nexus diagnosis report is ready',
        'Nexus has released your diagnosis report. Review the findings in your secure workspace and submit any questions directly from the report.',
        v_action,'diagnosis_report_release',v_release.id,
        'diagnosis_report:'||v_release.id::text||':'||v_member.user_id::text||':v'||v_release.report_version::text
      ) ON CONFLICT(dedupe_key) DO NOTHING;
    END IF;

    IF nullif(btrim(v_phone),'') IS NOT NULL AND coalesce(v_pref.sms_enabled,false) AND coalesce(v_pref.report_sms,true) THEN
      INSERT INTO public.nexus_sms_outbox(
        company_id,user_id,recipient_phone,message_kind,body_text,action_url,related_type,related_id,dedupe_key
      ) VALUES(
        v_run.company_id,v_member.user_id,v_phone,'diagnosis_report',
        'Nexus Intelligence: your diagnosis report is ready in your secure workspace.',
        v_action,'diagnosis_report_release',v_release.id,
        'diagnosis_report:'||v_release.id::text||':'||v_member.user_id::text||':v'||v_release.report_version::text
      ) ON CONFLICT(dedupe_key) DO NOTHING;
    END IF;
  END LOOP;

  RETURN v_release.id;
END
$function$;

REVOKE ALL ON FUNCTION public.nexus_release_diagnosis_report(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.nexus_release_diagnosis_report(uuid) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.nexus_submit_diagnosis_question(p_release_id uuid,p_question text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_release public.nexus_diagnosis_report_releases%rowtype;
  v_id uuid;
  v_admin record;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF char_length(btrim(coalesce(p_question,''))) < 2 THEN RAISE EXCEPTION 'Question is required'; END IF;

  SELECT * INTO v_release
  FROM public.nexus_diagnosis_report_releases
  WHERE id=p_release_id AND status='released';
  IF v_release.id IS NULL THEN RAISE EXCEPTION 'Released report not found'; END IF;
  IF NOT public.nexus_is_company_member(v_release.company_id) AND NOT public.nexus_is_platform_admin() THEN
    RAISE EXCEPTION 'Company membership required';
  END IF;

  INSERT INTO public.nexus_diagnosis_report_questions(
    release_id,company_id,project_id,asked_by,question
  ) VALUES(
    v_release.id,v_release.company_id,v_release.project_id,auth.uid(),btrim(p_question)
  ) RETURNING id INTO v_id;

  FOR v_admin IN SELECT user_id FROM public.nexus_platform_admins LOOP
    INSERT INTO public.nexus_notifications(
      company_id,user_id,notification_type,title,message,related_type,related_id,created_by,action_url
    ) VALUES(
      v_release.company_id,v_admin.user_id,'diagnosis_question',
      'New diagnosis report question',
      'A client submitted a question about a released diagnosis report.',
      'diagnosis_report_question',v_id,auth.uid(),
      '/portal?view=diagnosis-question&question='||v_id::text
    );
  END LOOP;

  RETURN v_id;
END
$function$;

REVOKE ALL ON FUNCTION public.nexus_submit_diagnosis_question(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.nexus_submit_diagnosis_question(uuid,text) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.nexus_answer_diagnosis_question(p_question_id uuid,p_answer text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_q public.nexus_diagnosis_report_questions%rowtype;
  v_pref public.nexus_notification_preferences%rowtype;
  v_email text;
  v_phone text;
  v_action text;
BEGIN
  IF NOT public.nexus_is_platform_admin() THEN RAISE EXCEPTION 'Nexus administrator access required'; END IF;
  IF char_length(btrim(coalesce(p_answer,''))) < 2 THEN RAISE EXCEPTION 'Answer is required'; END IF;

  SELECT * INTO v_q FROM public.nexus_diagnosis_report_questions WHERE id=p_question_id FOR UPDATE;
  IF v_q.id IS NULL THEN RAISE EXCEPTION 'Question not found'; END IF;

  UPDATE public.nexus_diagnosis_report_questions
  SET answer=btrim(p_answer),answered_by=auth.uid(),answered_at=now(),status='answered',updated_at=now()
  WHERE id=v_q.id;

  v_action := '/portal?view=diagnosis-report&release='||v_q.release_id::text;
  INSERT INTO public.nexus_notifications(
    company_id,user_id,notification_type,title,message,related_type,related_id,created_by,action_url
  ) VALUES(
    v_q.company_id,v_q.asked_by,'diagnosis_answer',
    'Nexus answered your diagnosis question',
    'An answer is available in your diagnosis report Q&A.',
    'diagnosis_report_question',v_q.id,auth.uid(),v_action
  );

  SELECT * INTO v_pref FROM public.nexus_notification_preferences
    WHERE company_id=v_q.company_id AND user_id=v_q.asked_by;
  SELECT email INTO v_email FROM auth.users WHERE id=v_q.asked_by;
  SELECT phone INTO v_phone FROM public.nexus_profiles WHERE user_id=v_q.asked_by;

  IF v_email IS NOT NULL AND coalesce(v_pref.email_enabled,true) AND coalesce(v_pref.qa_emails,true) THEN
    INSERT INTO public.nexus_email_outbox(
      company_id,user_id,recipient_email,message_kind,subject,body_text,action_url,related_type,related_id,dedupe_key
    ) VALUES(
      v_q.company_id,v_q.asked_by,v_email,'diagnosis_answer',
      'Nexus answered your report question',
      'Nexus answered a question you submitted about your diagnosis report. Open your secure workspace to read the answer.',
      v_action,'diagnosis_report_question',v_q.id,
      'diagnosis_answer:'||v_q.id::text||':'||extract(epoch from now())::bigint::text
    ) ON CONFLICT(dedupe_key) DO NOTHING;
  END IF;

  IF nullif(btrim(v_phone),'') IS NOT NULL AND coalesce(v_pref.sms_enabled,false) AND coalesce(v_pref.qa_sms,true) THEN
    INSERT INTO public.nexus_sms_outbox(
      company_id,user_id,recipient_phone,message_kind,body_text,action_url,related_type,related_id,dedupe_key
    ) VALUES(
      v_q.company_id,v_q.asked_by,v_phone,'diagnosis_answer',
      'Nexus Intelligence: an answer to your diagnosis report question is available in your secure workspace.',
      v_action,'diagnosis_report_question',v_q.id,
      'diagnosis_answer:'||v_q.id::text||':'||extract(epoch from now())::bigint::text
    ) ON CONFLICT(dedupe_key) DO NOTHING;
  END IF;

  RETURN v_q.id;
END
$function$;

REVOKE ALL ON FUNCTION public.nexus_answer_diagnosis_question(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.nexus_answer_diagnosis_question(uuid,text) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.nexus_revoke_diagnosis_report(p_release_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF NOT public.nexus_is_platform_admin() THEN RAISE EXCEPTION 'Nexus administrator access required'; END IF;
  UPDATE public.nexus_diagnosis_report_releases
  SET status='revoked',revoked_at=now(),updated_at=now()
  WHERE id=p_release_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Report release not found'; END IF;
  RETURN p_release_id;
END
$function$;

REVOKE ALL ON FUNCTION public.nexus_revoke_diagnosis_report(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.nexus_revoke_diagnosis_report(uuid) TO authenticated,service_role;

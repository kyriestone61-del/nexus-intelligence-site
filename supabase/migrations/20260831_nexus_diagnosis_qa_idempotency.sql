-- Prevent duplicate client notifications when an identical diagnosis Q&A answer is retried.
-- A materially changed answer remains a new client-visible update and may notify again.

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
  v_answer text;
BEGIN
  IF NOT public.nexus_is_platform_admin() THEN RAISE EXCEPTION 'Nexus administrator access required'; END IF;
  v_answer := btrim(coalesce(p_answer,''));
  IF char_length(v_answer) < 2 THEN RAISE EXCEPTION 'Answer is required'; END IF;

  SELECT * INTO v_q
  FROM public.nexus_diagnosis_report_questions
  WHERE id=p_question_id
  FOR UPDATE;
  IF v_q.id IS NULL THEN RAISE EXCEPTION 'Question not found'; END IF;

  -- Browser retries/double-submits of the same completed answer are no-ops.
  IF v_q.status='answered' AND btrim(coalesce(v_q.answer,''))=v_answer THEN
    RETURN v_q.id;
  END IF;

  UPDATE public.nexus_diagnosis_report_questions
  SET answer=v_answer,answered_by=auth.uid(),answered_at=now(),status='answered',updated_at=now()
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

  SELECT * INTO v_pref
  FROM public.nexus_notification_preferences
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
      'diagnosis_answer:'||v_q.id::text||':'||encode(digest(v_answer,'sha256'),'hex')
    ) ON CONFLICT(dedupe_key) DO NOTHING;
  END IF;

  IF nullif(btrim(v_phone),'') IS NOT NULL AND coalesce(v_pref.sms_enabled,false) AND coalesce(v_pref.qa_sms,true) THEN
    INSERT INTO public.nexus_sms_outbox(
      company_id,user_id,recipient_phone,message_kind,body_text,action_url,related_type,related_id,dedupe_key
    ) VALUES(
      v_q.company_id,v_q.asked_by,v_phone,'diagnosis_answer',
      'Nexus Intelligence: an answer to your diagnosis report question is available in your secure workspace.',
      v_action,'diagnosis_report_question',v_q.id,
      'diagnosis_answer:'||v_q.id::text||':'||encode(digest(v_answer,'sha256'),'hex')
    ) ON CONFLICT(dedupe_key) DO NOTHING;
  END IF;

  RETURN v_q.id;
END
$function$;

REVOKE ALL ON FUNCTION public.nexus_answer_diagnosis_question(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.nexus_answer_diagnosis_question(uuid,text) TO authenticated,service_role;

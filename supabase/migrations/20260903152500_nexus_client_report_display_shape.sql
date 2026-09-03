-- Align the server-side client-safe diagnosis projection with the canonical browser report vocabulary.
-- This fixes historical released reports that contained safe data under keys the current client serializer intentionally ignored.

create or replace function public.nexus_client_report_display_shape(p_report jsonb)
returns jsonb
language plpgsql
immutable
set search_path=''
as $$
declare
  v_report jsonb:=coalesce(p_report,'{}'::jsonb);
begin
  -- Already in browser-facing shape: keep it stable and idempotent.
  if v_report ? 'opportunities' or v_report ? 'findings' or v_report ? 'next_steps' then
    return v_report;
  end if;

  return jsonb_strip_nulls(jsonb_build_object(
    'title','Nexus Diagnosis Report',
    'executive_summary',v_report->'executive_summary',
    'findings',jsonb_strip_nulls(jsonb_build_object(
      'facts',v_report->'facts',
      'client_statements',v_report->'client_statements',
      'process_map',v_report->'process_map',
      'bottlenecks',v_report->'bottlenecks'
    )),
    'opportunities',coalesce(v_report->'opportunity_backlog','[]'::jsonb),
    'next_steps',v_report->'smallest_safe_pilot',
    'client_actions',coalesce(v_report->'client_action_items','[]'::jsonb),
    'appendix',jsonb_strip_nulls(jsonb_build_object(
      'follow_up_questions',v_report->'follow_up_questions',
      'success_metrics',v_report->'success_metrics'
    ))
  ));
end
$$;

revoke all on function public.nexus_client_report_display_shape(jsonb) from public,anon;
grant execute on function public.nexus_client_report_display_shape(jsonb) to authenticated;

create or replace function public.nexus_release_diagnosis_report(p_run_id uuid)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_run public.nexus_diagnosis_runs%rowtype;
  v_release public.nexus_diagnosis_report_releases%rowtype;
  v_member record;
  v_pref public.nexus_notification_preferences%rowtype;
  v_email text;
  v_phone text;
  v_action text;
  v_client_report jsonb;
begin
  if not public.nexus_is_platform_admin() then raise exception 'Nexus administrator access required'; end if;
  select * into v_run from public.nexus_diagnosis_runs where id=p_run_id for update;
  if v_run.id is null then raise exception 'Diagnosis not found'; end if;
  if v_run.status <> 'approved' or v_run.analysis_result is null then raise exception 'Only an approved diagnosis can be released'; end if;

  v_client_report:=public.nexus_client_report_display_shape(public.nexus_effective_client_report(v_run.id));

  insert into public.nexus_diagnosis_report_releases(
    company_id,project_id,diagnosis_run_id,client_report,status,report_version,released_by,released_at,updated_at
  ) values(
    v_run.company_id,v_run.project_id,v_run.id,v_client_report,'released',1,auth.uid(),now(),now()
  )
  on conflict(diagnosis_run_id) do update set
    client_report=excluded.client_report,
    status='released',
    report_version=public.nexus_diagnosis_report_releases.report_version+1,
    released_by=auth.uid(),released_at=now(),revoked_at=null,updated_at=now()
  returning * into v_release;

  v_action := '/portal?view=diagnosis-report&release='||v_release.id::text;
  for v_member in select m.user_id from public.nexus_company_members m where m.company_id=v_run.company_id and m.active is true loop
    insert into public.nexus_notifications(company_id,user_id,notification_type,title,message,related_type,related_id,created_by,action_url)
    values(v_run.company_id,v_member.user_id,'diagnosis_report','Your Nexus diagnosis report is ready','Nexus has released a client report for your review. Open it to review the findings and ask questions.','diagnosis_report_release',v_release.id,auth.uid(),v_action);

    select * into v_pref from public.nexus_notification_preferences where company_id=v_run.company_id and user_id=v_member.user_id;
    select email into v_email from auth.users where id=v_member.user_id;
    select phone into v_phone from public.nexus_profiles where user_id=v_member.user_id;

    if v_email is not null and coalesce(v_pref.email_enabled,true) and coalesce(v_pref.report_emails,true) then
      insert into public.nexus_email_outbox(company_id,user_id,recipient_email,message_kind,subject,body_text,action_url,related_type,related_id,dedupe_key)
      values(v_run.company_id,v_member.user_id,v_email,'diagnosis_report','Your Nexus diagnosis report is ready','Nexus has released your diagnosis report. Review the findings in your secure workspace and submit any questions directly from the report.',v_action,'diagnosis_report_release',v_release.id,'diagnosis_report:'||v_release.id::text||':'||v_member.user_id::text||':v'||v_release.report_version::text)
      on conflict(dedupe_key) do nothing;
    end if;

    if nullif(btrim(v_phone),'') is not null and coalesce(v_pref.sms_enabled,false) and coalesce(v_pref.report_sms,true) then
      insert into public.nexus_sms_outbox(company_id,user_id,recipient_phone,message_kind,body_text,action_url,related_type,related_id,dedupe_key)
      values(v_run.company_id,v_member.user_id,v_phone,'diagnosis_report','Nexus Intelligence: your diagnosis report is ready in your secure workspace.',v_action,'diagnosis_report_release',v_release.id,'diagnosis_report:'||v_release.id::text||':'||v_member.user_id::text||':v'||v_release.report_version::text)
      on conflict(dedupe_key) do nothing;
    end if;
  end loop;
  return v_release.id;
end
$$;

revoke all on function public.nexus_release_diagnosis_report(uuid) from public,anon;
grant execute on function public.nexus_release_diagnosis_report(uuid) to authenticated;

-- Repair the display shape of already released client-safe reports without changing their version,
-- release timestamp, notification history, or underlying diagnosis data.
update public.nexus_diagnosis_report_releases
set client_report=public.nexus_client_report_display_shape(client_report),updated_at=now()
where status='released' and revoked_at is null;

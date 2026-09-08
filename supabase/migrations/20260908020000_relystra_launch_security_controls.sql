-- Launch security and reliability controls for public intake, model execution,
-- recovery, and delivery-email health. All externally supplied identifiers are
-- already keyed hashes produced at the trusted Cloudflare boundary.
begin;

create table public.relystra_public_submission_events (
  id uuid primary key default gen_random_uuid(),
  submission_kind text not null check (submission_kind in ('opportunity_snapshot')),
  ip_hash text not null,
  email_hash text not null,
  dedupe_key text not null,
  related_id uuid,
  status text not null check (status in ('accepted','suppressed')),
  created_at timestamptz not null default now(),
  unique(submission_kind,dedupe_key)
);
alter table public.relystra_public_submission_events enable row level security;
revoke all on table public.relystra_public_submission_events from public,anon,authenticated;
grant select,insert,update,delete on table public.relystra_public_submission_events to service_role;
create index relystra_public_submission_ip_time_idx on public.relystra_public_submission_events(submission_kind,ip_hash,created_at desc);
create index relystra_public_submission_email_time_idx on public.relystra_public_submission_events(submission_kind,email_hash,created_at desc);

create or replace function public.submit_relystra_opportunity_snapshot(
  payload jsonb,p_ip_hash text,p_email_hash text,p_dedupe_key text
)
returns uuid language plpgsql security definer set search_path='' as $$
declare existing_id uuid; event_id uuid; snapshot_id uuid; ip_recent integer; email_recent integer; global_recent integer;
begin
  if length(coalesce(p_ip_hash,''))<32 or length(coalesce(p_email_hash,''))<32 or length(coalesce(p_dedupe_key,''))<32 then
    raise exception 'Invalid submission identity';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('snapshot-ip:'||p_ip_hash,0));
  perform pg_advisory_xact_lock(hashtextextended('snapshot-email:'||p_email_hash,0));
  select related_id into existing_id from public.relystra_public_submission_events
    where submission_kind='opportunity_snapshot' and dedupe_key=p_dedupe_key and status='accepted';
  if existing_id is not null then return existing_id; end if;
  delete from public.relystra_public_submission_events where created_at<now()-interval '30 days';
  select count(*) into ip_recent from public.relystra_public_submission_events
    where submission_kind='opportunity_snapshot' and ip_hash=p_ip_hash and created_at>=now()-interval '1 hour';
  select count(*) into email_recent from public.relystra_public_submission_events
    where submission_kind='opportunity_snapshot' and email_hash=p_email_hash and created_at>=now()-interval '1 hour';
  select count(*) into global_recent from public.relystra_public_submission_events
    where submission_kind='opportunity_snapshot' and created_at>=now()-interval '1 hour';
  if ip_recent>=12 or email_recent>=3 or global_recent>=120 then
    insert into public.relystra_public_submission_events(submission_kind,ip_hash,email_hash,dedupe_key,status)
      values('opportunity_snapshot',p_ip_hash,p_email_hash,p_dedupe_key,'suppressed') on conflict do nothing;
    raise exception 'Submission rate limit reached';
  end if;
  insert into public.relystra_public_submission_events(submission_kind,ip_hash,email_hash,dedupe_key,status)
    values('opportunity_snapshot',p_ip_hash,p_email_hash,p_dedupe_key,'accepted') returning id into event_id;
  snapshot_id:=nexus_public_internal.submit_opportunity_snapshot(payload);
  update public.relystra_public_submission_events set related_id=snapshot_id where id=event_id;
  return snapshot_id;
end $$;
revoke all on function public.submit_relystra_opportunity_snapshot(jsonb,text,text,text) from public,anon,authenticated;
grant execute on function public.submit_relystra_opportunity_snapshot(jsonb,text,text,text) to service_role;

-- The legacy anonymous RPC remains available only during the deployment overlap.
-- A follow-up migration revokes it after the trusted Pages endpoint is live.

-- Snapshot submission is first-party evidence, but it is not proof that the
-- submitter owns the supplied email address. It must never queue billable model
-- work or authorize outreach until ownership is verified.
create or replace function public.nexus_sync_opportunity_snapshot_to_revenue()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
  insert into public.nexus_revenue_leads(
    source,source_ref,source_snapshot_lead_id,company_name,niche,business_email,business_phone,
    contact_provenance,opportunity_score,score_method,score_confidence,primary_bottlenecks,
    stage,do_not_contact,suppression_reason,lead_summary,suggested_action
  ) values(
    'website_opportunity_snapshot',new.id::text,new.id,coalesce(nullif(new.company_name,''),'Unnamed Snapshot Lead'),new.business_type,new.email,new.phone,
    jsonb_build_object('source','website_opportunity_snapshot','email_unverified',true,'email_provided_by_prospect',false,'marketing_opt_in',new.marketing_opt_in,'sms_opt_in',new.sms_opt_in),
    new.opportunity_score,'website_snapshot_v1',100,
    coalesce((select jsonb_agg(jsonb_build_object('label',x)) from unnest(new.opportunity_areas) x),'[]'::jsonb),
    case when new.unsubscribed_at is not null then 'suppressed' when new.opportunity_score<=50 then 'qualified' else 'scored' end,
    new.unsubscribed_at is not null,case when new.unsubscribed_at is not null then 'Snapshot lead unsubscribed.' else null end,
    coalesce(new.primary_opportunity,'Website Opportunity Snapshot lead.'),
    case when new.opportunity_score<=50 then 'Verify contact ownership before preparing outreach.' else 'Nurture/research before outreach packet.' end
  ) on conflict(source_snapshot_lead_id) do update set
    company_name=excluded.company_name,niche=excluded.niche,business_email=excluded.business_email,business_phone=excluded.business_phone,
    contact_provenance=excluded.contact_provenance,opportunity_score=excluded.opportunity_score,score_method=excluded.score_method,
    score_confidence=excluded.score_confidence,primary_bottlenecks=excluded.primary_bottlenecks,do_not_contact=excluded.do_not_contact,
    suppression_reason=excluded.suppression_reason,updated_at=now()
  returning id into v_id;
  perform public.nexus_classify_revenue_lead_exceptions(v_id);
  return new;
end $$;
revoke all on function public.nexus_sync_opportunity_snapshot_to_revenue() from public,anon,authenticated;
update public.nexus_revenue_leads set
  contact_provenance=coalesce(contact_provenance,'{}'::jsonb)||jsonb_build_object('email_unverified',true,'email_provided_by_prospect',false),
  suggested_action=case when opportunity_score<=50 then 'Verify contact ownership before preparing outreach.' else suggested_action end,
  updated_at=now()
where source='website_opportunity_snapshot';
update public.nexus_revenue_agent_jobs j set status='cancelled',completed_at=now(),error='CONTACT_OWNERSHIP_UNVERIFIED',updated_at=now()
where status in ('queued','running') and exists(select 1 from public.nexus_revenue_leads l where l.id=j.lead_id and l.source='website_opportunity_snapshot');

create or replace function public.nexus_revenue_lead_contactable(p_lead_id uuid)
returns boolean language sql security definer stable set search_path='' as $$
  select coalesce((select
    not l.do_not_contact and l.stage<>'suppressed' and nullif(btrim(l.business_email),'') is not null
    and (
      lower(coalesce(l.contact_provenance->>'business_contact_verified','false'))='true'
      or lower(coalesce(l.contact_provenance->>'inbound_request_verified','false'))='true'
      or lower(coalesce(l.contact_provenance->>'email_ownership_verified','false'))='true'
    )
    and not exists(select 1 from public.nexus_lead_exceptions e where e.lead_id=l.id and e.status in ('open','acknowledged') and e.severity in ('high','critical'))
    from public.nexus_revenue_leads l where l.id=p_lead_id),false)
$$;
revoke all on function public.nexus_revenue_lead_contactable(uuid) from public,anon,authenticated;
grant execute on function public.nexus_revenue_lead_contactable(uuid) to service_role;

create table public.relystra_support_turn_claims (
  turn_id uuid primary key,
  company_id uuid not null references public.nexus_companies(id) on delete cascade,
  project_id uuid not null references public.nexus_projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  question_hash text not null,
  status text not null check(status in ('running','complete','failed')),
  lease_id uuid,
  lease_expires_at timestamptz,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
alter table public.relystra_support_turn_claims enable row level security;
revoke all on table public.relystra_support_turn_claims from public,anon,authenticated;
grant select,insert,update,delete on table public.relystra_support_turn_claims to service_role;
create index relystra_support_claim_user_time_idx on public.relystra_support_turn_claims(user_id,created_at desc);
create index relystra_support_claim_company_time_idx on public.relystra_support_turn_claims(company_id,created_at desc);

create or replace function public.relystra_claim_support_turn(p_turn_id uuid,p_project_id uuid,p_user_id uuid,p_question text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.nexus_projects%rowtype; c public.relystra_support_turn_claims%rowtype; q_hash text; lease uuid:=gen_random_uuid();
  user_recent integer; company_recent integer; global_recent integer;
begin
  if p_turn_id is null or p_user_id is null or nullif(btrim(p_question),'') is null or length(p_question)>2000 then raise exception 'A support question and turn identifier are required'; end if;
  select * into p from public.nexus_projects where id=p_project_id and project_type='build_package' and final_package is not null;
  if p.id is null or p.support_ends_at is null or p.support_ends_at<=now() then raise exception 'The included support period has ended'; end if;
  if not (exists(select 1 from public.nexus_platform_admins where user_id=p_user_id) or exists(select 1 from public.nexus_company_members where company_id=p.company_id and user_id=p_user_id and active)) then raise exception 'Delivered package access required'; end if;
  q_hash:=md5(p_question);
  perform pg_advisory_xact_lock(hashtextextended('support-turn:'||p_turn_id::text,0));
  select * into c from public.relystra_support_turn_claims where turn_id=p_turn_id;
  if c.turn_id is not null then
    if c.project_id<>p_project_id or c.user_id<>p_user_id or c.question_hash<>q_hash then raise exception 'Support turn identifier already used'; end if;
    if c.status='complete' then return jsonb_build_object('ok',true,'state','complete'); end if;
    if c.status='running' and c.lease_expires_at>now() then return jsonb_build_object('ok',true,'state','in_progress'); end if;
  end if;
  select count(*) into user_recent from public.relystra_support_turn_claims where user_id=p_user_id and created_at>=now()-interval '1 hour';
  select count(*) into company_recent from public.relystra_support_turn_claims where company_id=p.company_id and created_at>=now()-interval '1 hour';
  select count(*) into global_recent from public.relystra_support_turn_claims where created_at>=now()-interval '1 hour';
  if user_recent>=10 or company_recent>=50 or global_recent>=250 then raise exception 'Support request limit reached; try again later'; end if;
  insert into public.relystra_support_turn_claims(turn_id,company_id,project_id,user_id,question_hash,status,lease_id,lease_expires_at)
    values(p_turn_id,p.company_id,p.id,p_user_id,q_hash,'running',lease,now()+interval '2 minutes')
    on conflict(turn_id) do update set status='running',lease_id=lease,lease_expires_at=now()+interval '2 minutes';
  return jsonb_build_object('ok',true,'state','claimed','lease_id',lease);
end $$;
create or replace function public.relystra_finish_support_turn(p_turn_id uuid,p_lease_id uuid,p_status text)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  if p_status not in ('complete','failed') then raise exception 'Invalid support completion state'; end if;
  update public.relystra_support_turn_claims set status=p_status,completed_at=now(),lease_expires_at=null
    where turn_id=p_turn_id and lease_id=p_lease_id and status='running';
  return found;
end $$;
revoke all on function public.relystra_claim_support_turn(uuid,uuid,uuid,text),public.relystra_finish_support_turn(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.relystra_claim_support_turn(uuid,uuid,uuid,text),public.relystra_finish_support_turn(uuid,uuid,text) to service_role;

alter table public.nexus_diagnosis_runs add column if not exists execution_lease_id uuid;
alter table public.nexus_diagnosis_runs add column if not exists execution_lease_expires_at timestamptz;

create or replace function public.relystra_claim_diagnosis_execution(p_run_id uuid,p_retry_budget integer default 3)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.nexus_diagnosis_runs%rowtype; lease uuid:=gen_random_uuid();
begin
  select * into r from public.nexus_diagnosis_runs where id=p_run_id for update;
  if r.id is null then raise exception 'Diagnosis run not found'; end if;
  if r.status='analyzing' and r.execution_lease_expires_at>now() then return jsonb_build_object('ok',false,'error','DIAGNOSIS_ALREADY_RUNNING'); end if;
  if r.status not in ('queued','revision_requested','failed','blocked','analyzing') then return jsonb_build_object('ok',false,'error','DIAGNOSIS_STATE_CONFLICT'); end if;
  if coalesce(r.execution_attempts,0)>=greatest(1,p_retry_budget) then
    update public.nexus_diagnosis_runs set status='blocked',blocked_reason='RETRY_BUDGET_EXCEEDED',execution_error='RETRY_BUDGET_EXCEEDED',updated_at=now() where id=r.id;
    return jsonb_build_object('ok',false,'error','RETRY_BUDGET_EXCEEDED');
  end if;
  update public.nexus_diagnosis_runs set status='analyzing',analysis_started_at=now(),analysis_completed_at=null,
    execution_error=null,blocked_reason=null,execution_attempts=coalesce(execution_attempts,0)+1,
    execution_lease_id=lease,execution_lease_expires_at=now()+interval '4 minutes',updated_at=now()
    where id=r.id returning * into r;
  return jsonb_build_object('ok',true,'lease_id',lease,'run',to_jsonb(r));
end $$;
create or replace function public.relystra_complete_diagnosis_execution(p_run_id uuid,p_lease_id uuid,p_result jsonb)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  update public.nexus_diagnosis_runs set status='ready_for_review',analysis_result=p_result,analysis_completed_at=now(),
    execution_error=null,blocked_reason=null,execution_lease_id=null,execution_lease_expires_at=null,updated_at=now()
    where id=p_run_id and execution_lease_id=p_lease_id and status='analyzing';
  return found;
end $$;
create or replace function public.relystra_fail_diagnosis_execution(p_run_id uuid,p_lease_id uuid,p_error text,p_blocked boolean)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  update public.nexus_diagnosis_runs set status=case when p_blocked then 'blocked' else 'failed' end,
    execution_error=left(coalesce(p_error,'Diagnosis execution failed'),1200),blocked_reason=case when p_blocked then left(coalesce(p_error,'Diagnosis execution failed'),1200) else null end,
    analysis_completed_at=now(),execution_lease_id=null,execution_lease_expires_at=null,updated_at=now()
    where id=p_run_id and execution_lease_id=p_lease_id and status='analyzing';
  return found;
end $$;
revoke all on function public.relystra_claim_diagnosis_execution(uuid,integer),public.relystra_complete_diagnosis_execution(uuid,uuid,jsonb),public.relystra_fail_diagnosis_execution(uuid,uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.relystra_claim_diagnosis_execution(uuid,integer),public.relystra_complete_diagnosis_execution(uuid,uuid,jsonb),public.relystra_fail_diagnosis_execution(uuid,uuid,text,boolean) to service_role;

create or replace function public.relystra_email_delivery_status()
returns jsonb language sql security definer stable set search_path='' as $$
  with latest as (
    select status,checked_at,details from public.nexus_system_health where check_name='email_delivery' order by checked_at desc limit 1
  ), settings as (
    select delivery_emails_enabled from public.nexus_delivery_settings where singleton limit 1
  ) select jsonb_build_object(
    'configured',coalesce((select status in ('healthy','degraded') and checked_at>=now()-interval '10 minutes' from latest),false),
    'provider',case when coalesce((select status in ('healthy','degraded') and checked_at>=now()-interval '10 minutes' from latest),false) then 'resend' else null end,
    'in_app',true,'queue',true,'delivery_enabled',coalesce((select delivery_emails_enabled from settings),false),
    'worker_status',coalesce((select status from latest),'unknown'),'checked_at',(select checked_at from latest)
  )
$$;
revoke all on function public.relystra_email_delivery_status() from public;
grant execute on function public.relystra_email_delivery_status() to anon,authenticated,service_role;
update public.nexus_delivery_settings set delivery_emails_enabled=true where singleton;

create or replace function public.relystra_find_auth_user(p_email text)
returns uuid language sql security definer stable set search_path='' as $$
  select id from auth.users where lower(email)=lower(btrim(p_email)) and deleted_at is null limit 1
$$;
revoke all on function public.relystra_find_auth_user(text) from public,anon,authenticated;
grant execute on function public.relystra_find_auth_user(text) to service_role;

create or replace function public.relystra_queue_client_invite(p_user_id uuid,p_company_id uuid,p_actor_id uuid,p_email text,p_full_name text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare event_id uuid;email_value text;slot text;
begin
  if not exists(select 1 from public.nexus_platform_admins where user_id=p_actor_id) then raise exception 'Relystra administrator access required'; end if;
  if not exists(select 1 from public.nexus_companies where id=p_company_id) then raise exception 'Client company not found'; end if;
  select lower(email) into email_value from auth.users where id=p_user_id and deleted_at is null;
  if email_value is null or email_value<>lower(btrim(p_email)) then raise exception 'Invitation account does not match'; end if;
  insert into public.nexus_company_members(company_id,user_id,member_role,active,added_by,updated_at)
    values(p_company_id,p_user_id,'client',true,p_actor_id,now())
    on conflict(company_id,user_id) do update set member_role='client',active=true,added_by=p_actor_id,updated_at=now();
  insert into public.platform_auth_email_events(app,event_type,email_hash,ip_hash,status,metadata)
    values('relystra','invite',md5(email_value),'admin_invite','requested',jsonb_build_object('company_id',p_company_id,'delivery_path','nexus_email_outbox','token_persisted',false)) returning id into event_id;
  slot:=floor(extract(epoch from now())/900)::bigint::text;
  insert into public.nexus_email_outbox(company_id,user_id,recipient_email,message_kind,subject,body_text,action_url,related_type,related_id,payload,dedupe_key,status,available_at)
    values(p_company_id,p_user_id,email_value,'auth_invite','Your Relystra workspace is ready',
      'You have been invited to a private Relystra client workspace.',null,'auth_email_event',event_id,
      jsonb_build_object('company_id',p_company_id,'full_name',nullif(btrim(p_full_name),'')),
      'auth-invite:'||p_company_id::text||':'||p_user_id::text||':'||slot,'queued',now())
    on conflict(dedupe_key) do nothing;
  return jsonb_build_object('ok',true,'company_id',p_company_id,'user_id',p_user_id,'queued',true);
end $$;
revoke all on function public.relystra_queue_client_invite(uuid,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.relystra_queue_client_invite(uuid,uuid,uuid,text,text) to service_role;

-- Add a global recovery ceiling and bounded audit retention while preserving
-- generic responses and the existing per-email/per-IP limits.
create or replace function public.nexus_queue_auth_recovery(p_email text,p_email_hash text,p_ip_hash text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,auth as $$
declare v_email text:=lower(trim(coalesce(p_email,'')));v_email_hash text:=trim(coalesce(p_email_hash,''));v_ip_hash text:=trim(coalesce(p_ip_hash,''));
  v_user_id uuid;v_event_id uuid;v_email_recent integer:=0;v_ip_recent integer:=0;v_global_recent integer:=0;
begin
  if v_email='' or length(v_email)>254 or position('@' in v_email)<2 or length(v_email_hash)<32 or length(v_ip_hash)<32 then return jsonb_build_object('ok',false,'error','invalid_request'); end if;
  perform pg_advisory_xact_lock(hashtextextended('auth-ip:'||v_ip_hash,0));perform pg_advisory_xact_lock(hashtextextended('auth-email:'||v_email_hash,0));
  delete from public.platform_auth_email_events where requested_at<now()-interval '90 days';
  select count(*) into v_email_recent from public.platform_auth_email_events where app='relystra' and event_type='recovery' and email_hash=v_email_hash and requested_at>=now()-interval '1 hour';
  select count(*) into v_ip_recent from public.platform_auth_email_events where app='relystra' and event_type='recovery' and ip_hash=v_ip_hash and requested_at>=now()-interval '1 hour';
  select count(*) into v_global_recent from public.platform_auth_email_events where app='relystra' and event_type='recovery' and requested_at>=now()-interval '1 hour';
  insert into public.platform_auth_email_events(app,event_type,email_hash,ip_hash,status,metadata) values('relystra','recovery',v_email_hash,v_ip_hash,'requested',jsonb_build_object('delivery_path','nexus_email_outbox','token_persisted',false)) returning id into v_event_id;
  if v_email_recent>=3 or v_ip_recent>=12 or v_global_recent>=120 then update public.platform_auth_email_events set status='suppressed',error_code='rate_limited' where id=v_event_id;return jsonb_build_object('ok',true,'queued',false,'suppressed',true);end if;
  select u.id into v_user_id from auth.users u where lower(u.email)=v_email and u.deleted_at is null limit 1;
  if v_user_id is null then update public.platform_auth_email_events set status='not_found',error_code='account_not_found' where id=v_event_id;return jsonb_build_object('ok',true,'queued',false,'not_found',true);end if;
  insert into public.nexus_email_outbox(user_id,recipient_email,message_kind,subject,body_text,action_url,related_type,related_id,payload,dedupe_key,status,available_at)
    values(v_user_id,v_email,'auth_recovery','Reset your Relystra password','A password reset was requested for your Relystra account.',null,'auth_email_event',v_event_id,'{}'::jsonb,'auth-recovery:'||v_event_id::text,'queued',now());
  return jsonb_build_object('ok',true,'queued',true);
end $$;
revoke all on function public.nexus_queue_auth_recovery(text,text,text) from public,anon,authenticated;
grant execute on function public.nexus_queue_auth_recovery(text,text,text) to service_role;

commit;

begin;
alter table public.nexus_discovery_requests
 add column if not exists company_id uuid references public.nexus_companies(id),
 add column if not exists discovery_transcript text,
 add column if not exists basic_report jsonb,
 add column if not exists report_state text not null default 'draft' check(report_state in ('draft','approved','sent','accepted','declined','discussion','paid')),
 add column if not exists report_approved_by uuid references auth.users(id),
 add column if not exists report_approved_at timestamptz,
 add column if not exists report_versions jsonb not null default '[]',
 add column if not exists report_token_hash text,
 add column if not exists report_expires_at timestamptz,
 add column if not exists initial_plan_id uuid references public.nexus_build_plans(id),
 add column if not exists invited_user_id uuid references auth.users(id),
 add column if not exists prospect_profile jsonb not null default '{}';
alter table public.nexus_build_plans
 add column if not exists deposit_cents integer check(deposit_cents>0 and deposit_cents<=total_cents),
 add column if not exists source_discovery_id uuid references public.nexus_discovery_requests(id),
 add column if not exists parent_plan_id uuid references public.nexus_build_plans(id);
alter table public.nexus_build_plans drop constraint nexus_build_plans_purchase_kind_check;
alter table public.nexus_build_plans add constraint nexus_build_plans_purchase_kind_check check(purchase_kind in ('diagnosis','build_package','balance'));
create unique index relystra_one_open_balance on public.nexus_build_plans(parent_plan_id) where purchase_kind='balance' and status<>'cancelled';
alter table public.nexus_projects add column if not exists source_discovery_id uuid references public.nexus_discovery_requests(id);
alter table public.nexus_opportunities add column if not exists source_discovery_id uuid references public.nexus_discovery_requests(id);
-- No public table access to transcript, capability hashes, internal review, or prospect metadata.
revoke all on public.nexus_discovery_requests from anon,authenticated;
grant select on public.nexus_discovery_requests to authenticated;
alter table public.nexus_discovery_requests enable row level security;
create policy relystra_discovery_admin_read on public.nexus_discovery_requests for select to authenticated using(public.nexus_is_platform_admin());

create or replace function public.relystra_save_basic_report(p_id uuid,p_company_id uuid,p_contact jsonb,p_transcript text,p_report jsonb,p_approve boolean default false)
returns uuid language plpgsql security definer set search_path='' as $$
declare d public.nexus_discovery_requests%rowtype; primary_build jsonb; later_build jsonb; template public.nexus_resolution_catalog%rowtype; offer public.nexus_commercial_offerings%rowtype; cfg public.nexus_delivery_settings%rowtype; key text;
begin
 if auth.uid() is null or not public.nexus_is_platform_admin() then raise exception 'Administrator access required'; end if;
 if not exists(select 1 from public.nexus_companies where id=p_company_id) then raise exception 'Company required'; end if;
 if p_id is not null then
  select * into d from public.nexus_discovery_requests where id=p_id and (company_id is null or company_id=p_company_id) for update;
  if d.id is null then raise exception 'Discovery not found'; end if;
  if d.initial_plan_id is not null and exists(select 1 from public.nexus_build_plans where id=d.initial_plan_id and status<>'cancelled') then raise exception 'Accepted scope is retained. Cancel an unpaid plan before revising the report'; end if;
 end if;
 if jsonb_typeof(p_report) is distinct from 'object' or jsonb_typeof(p_report->'primary') is distinct from 'object'
  or jsonb_typeof(p_report->'later') is distinct from 'array' or jsonb_array_length(p_report->'later')>2 then raise exception 'Basic Report requires exactly one primary Build and at most two later opportunities'; end if;
 if length(p_transcript)>500000 or length(p_report::text)>50000 then raise exception 'Report or transcript exceeds the supported size'; end if;
 primary_build:=p_report->'primary';
 select * into template from public.nexus_resolution_catalog where code=primary_build->>'template_code' and active and default_recipe->>'catalog_kind'='build_template';
 select * into offer from public.nexus_commercial_offerings where code=primary_build->>'offer_code' and active;
 select * into cfg from public.nexus_delivery_settings where singleton;
 if p_approve then
  if length(btrim(coalesce(p_transcript,'')))<20 then raise exception 'Retain the authentic Discovery transcript before approval'; end if;
  if template.code is null or offer.code is null or not (template.default_recipe->'eligible_offers' ? offer.code) then raise exception 'Choose a valid Build and eligible Offer'; end if;
  foreach key in array array['name','outcome','problem'] loop
   if length(btrim(coalesce(primary_build->>key,'')))<3 then raise exception 'Confirm the primary Build %',key; end if;
  end loop;
  foreach key in array array['scope_in','scope_out','inputs','deliverables','acceptance_criteria'] loop
   if jsonb_typeof(primary_build->key) is distinct from 'array' or jsonb_array_length(primary_build->key)<1 or exists(select 1 from jsonb_array_elements(primary_build->key) v where jsonb_typeof(v)<>'string' or length(btrim(v#>>'{}'))<2) then raise exception 'Confirm %',key; end if;
  end loop;
  if length(btrim(coalesce(p_report->>'heard','')))<5 or length(btrim(coalesce(p_report->>'bottleneck','')))<5 then raise exception 'Summarize what was heard and the primary bottleneck'; end if;
  if coalesce(primary_build->>'price_cents','') !~ '^[0-9]{1,8}$' or (primary_build->>'price_cents')::integer<1
   or primary_build->>'currency' is distinct from cfg.currency or coalesce(primary_build->>'deposit_cents','') !~ '^[0-9]{1,8}$'
   or (primary_build->>'deposit_cents')::integer not between 1 and (primary_build->>'price_cents')::integer
   or coalesce(primary_build->>'duration_min','') !~ '^[0-9]{1,3}$' or coalesce(primary_build->>'duration_max','') !~ '^[0-9]{1,3}$'
   or (primary_build->>'duration_min')::integer<1 or (primary_build->>'duration_max')::integer<(primary_build->>'duration_min')::integer then raise exception 'Approve a valid price, required deposit and duration'; end if;
  if ((primary_build->>'price_cents')::integer<coalesce((template.default_recipe->>'min_price_cents')::integer,1)
    or (primary_build->>'price_cents')::integer>coalesce((template.default_recipe->>'max_price_cents')::integer,2147483647)) and length(btrim(coalesce(primary_build->>'price_override_reason','')))<10 then raise exception 'Record the reason for pricing outside Library guidance'; end if;
  if (select count(distinct v->>'template_code') from jsonb_array_elements(p_report->'later') v)<>jsonb_array_length(p_report->'later') then raise exception 'Later opportunities must be distinct'; end if;
  for later_build in select value from jsonb_array_elements(p_report->'later') loop
   if length(btrim(coalesce(later_build->>'name','')))<3 or length(btrim(coalesce(later_build->>'why','')))<5 then raise exception 'Describe each later opportunity briefly'; end if;
   if not exists(select 1 from public.nexus_resolution_catalog where code=later_build->>'template_code' and active) or later_build->>'template_code'=template.code then raise exception 'Later opportunities must be valid different Builds'; end if;
  end loop;
 end if;
 if coalesce(p_contact->>'email','') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or length(btrim(coalesce(p_contact->>'full_name','')))<1 then raise exception 'Contact name and email required'; end if;
 if d.id is null then
  insert into public.nexus_discovery_requests(company_id,full_name,email,company_name,problem_summary) values(p_company_id,p_contact->>'full_name',lower(p_contact->>'email'),(select name from public.nexus_companies where id=p_company_id),coalesce(p_report->>'heard','Discovery')) returning * into d;
 end if;
 update public.nexus_discovery_requests set company_id=p_company_id,full_name=p_contact->>'full_name',email=lower(p_contact->>'email'),discovery_transcript=p_transcript,basic_report=p_report,
 report_state=case when p_approve then 'approved' else 'draft' end,report_approved_by=case when p_approve then auth.uid() end,report_approved_at=case when p_approve then now() end,
 initial_plan_id=null,report_token_hash=null,report_expires_at=null,prospect_profile=coalesce(p_contact->'profile','{}'),
 report_versions=report_versions||jsonb_build_array(jsonb_build_object('report',p_report,'actor',auth.uid(),'at',now(),'approved',p_approve)) where id=d.id;
 return d.id;
end $$;
create or replace function public.relystra_share_basic_report(p_id uuid)
returns text language plpgsql security definer set search_path='' as $$
declare token text:=replace(gen_random_uuid()::text||gen_random_uuid()::text,'-','');
begin
 if auth.uid() is null or not public.nexus_is_platform_admin() then raise exception 'Administrator access required'; end if;
 update public.nexus_discovery_requests set report_token_hash=encode(sha256(convert_to(token,'UTF8')),'hex'),report_expires_at=now()+interval '30 days',report_state=case when report_state='approved' then 'sent' else report_state end
 where id=p_id and report_approved_at is not null;
 if not found then raise exception 'Approve the Basic Report first'; end if;
 return token;
end $$;
-- Only the Edge gateway may resolve capabilities. Tokens never grant workspace membership.
create or replace function public.relystra_basic_report_access(p_token text,p_operation text default 'view')
returns jsonb language plpgsql security definer set search_path='' as $$
declare d public.nexus_discovery_requests%rowtype; item jsonb; plan public.nexus_build_plans%rowtype; op_id uuid; price integer; digest text;
begin
 if p_token !~ '^[0-9a-f]{64}$' or p_operation not in ('view','accept','decline','discuss','checkout') then raise exception 'Report unavailable'; end if;
 select * into d from public.nexus_discovery_requests where report_token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex') and report_expires_at>now() and report_approved_at is not null for update;
 if d.id is null then raise exception 'Report unavailable'; end if;
 if p_operation in ('decline','discuss') then
  if d.initial_plan_id is not null and exists(select 1 from public.nexus_build_plans where id=d.initial_plan_id and status<>'cancelled') then raise exception 'An accepted plan already exists'; end if;
  update public.nexus_discovery_requests set report_state=case when p_operation='decline' then 'declined' else 'discussion' end where id=d.id;
  d.report_state:=case when p_operation='decline' then 'declined' else 'discussion' end;
 end if;
 if p_operation='accept' and d.initial_plan_id is null then
  item:=d.basic_report->'primary';price:=(item->>'price_cents')::integer;
  if not exists(select 1 from public.nexus_resolution_catalog where code=item->>'template_code' and active) then raise exception 'This recommendation needs administrator review'; end if;
  insert into public.nexus_opportunities(company_id,title,problem,created_by,source_discovery_id,build_spec,build_review_state,build_approved_by,build_approved_at)
   values(d.company_id,item->>'name',item->>'problem',d.report_approved_by,d.id,item||jsonb_build_object('commercial_state','commercially_ready','source','discovery'),'approved',d.report_approved_by,d.report_approved_at) returning id into op_id;
  -- Explicit allowlist: internal pricing judgment and arbitrary report properties never enter paid/client scope.
  item:=jsonb_build_object('id',op_id,'name',item->>'name','problem',item->>'problem','outcome',item->>'outcome','template_code',item->>'template_code','offer_code',item->>'offer_code',
   'scope_in',item->'scope_in','scope_out',item->'scope_out','inputs',item->'inputs','deliverables',item->'deliverables','acceptance_criteria',item->'acceptance_criteria',
   'price_cents',price,'deposit_cents',item->'deposit_cents','currency',item->>'currency','duration_min',item->'duration_min','duration_max',item->'duration_max','dependencies','[]'::jsonb,'source_discovery_id',d.id);
  digest:=md5(item::text||':'||d.id::text);
  insert into public.nexus_build_plans(company_id,purchase_kind,name,items,total_cents,deposit_cents,currency,duration_min,duration_max,duration_assumptions,snapshot_digest,created_by,source_discovery_id)
   values(d.company_id,'build_package',item->>'name',jsonb_build_array(item),price,(item->>'deposit_cents')::integer,item->>'currency',(item->>'duration_min')::integer,(item->>'duration_max')::integer,
    jsonb_build_object('unit','business_days','starts','after required inputs and brief approval; subject to the confirmed delivery queue'),digest,d.report_approved_by,d.id) returning * into plan;
  update public.nexus_discovery_requests set initial_plan_id=plan.id,report_state='accepted' where id=d.id;
  d.initial_plan_id:=plan.id;d.report_state:='accepted';
 end if;
 select * into plan from public.nexus_build_plans where id=d.initial_plan_id;
 item:=d.basic_report->'primary';
 return jsonb_build_object('id',d.id,'company_id',d.company_id,'actor_id',d.report_approved_by,'state',case when plan.status='paid' then 'paid' else d.report_state end,
  'company_name',d.company_name,'heard',d.basic_report->>'heard','bottleneck',d.basic_report->>'bottleneck',
  'primary',jsonb_build_object('name',item->>'name','outcome',item->>'outcome','scope_in',item->'scope_in','scope_out',item->'scope_out','inputs',item->'inputs','deliverables',item->'deliverables','price_cents',item->'price_cents','deposit_cents',item->'deposit_cents','currency',item->>'currency','duration_min',item->'duration_min','duration_max',item->'duration_max',
   'offer_name',(select name from public.nexus_commercial_offerings where code=item->>'offer_code')),
  'later',coalesce((select jsonb_agg(jsonb_build_object('name',v->>'name','why',v->>'why')) from jsonb_array_elements(d.basic_report->'later') v),'[]'),
  'plan_id',plan.id,'plan_status',plan.status,'invitation_queued',d.invited_user_id is not null);
end $$;

create or replace function public.relystra_record_verified_payment(p_plan_id uuid, p_event_id text, p_session_id text, p_payment_reference text, p_amount_cents integer, p_currency text, p_livemode boolean, p_snapshot_digest text, p_account_id text) returns uuid language plpgsql security definer set search_path='' as $$

declare p public.nexus_build_plans%rowtype; existing public.nexus_delivery_payment_events%rowtype;
begin
  -- Execution is granted only to service_role. The Edge Function verifies the raw Stripe signature,
  -- account, application metadata, checkout session and paid status before calling this RPC.
  select * into p from public.nexus_build_plans where id=p_plan_id for update;
  if p.id is null or p.status='cancelled' then raise exception 'Payable plan not found'; end if;
  if p.checkout_session_id is distinct from p_session_id or p_session_id is null or p.snapshot_digest is distinct from p_snapshot_digest then raise exception 'Payment does not match the issued checkout session and scope'; end if;
  if coalesce(p.deposit_cents,p.total_cents) is distinct from p_amount_cents or p.currency is distinct from p_currency or p.checkout_livemode is distinct from p_livemode
    or p.checkout_account_id is distinct from p_account_id or p_account_id is null then raise exception 'Payment amount, currency or environment mismatch'; end if;
  if nullif(p_event_id,'') is null or nullif(p_payment_reference,'') is null then raise exception 'Payment evidence is required'; end if;
  select * into existing from public.nexus_delivery_payment_events where event_id=p_event_id or (provider='stripe' and payment_reference=p_payment_reference);
  if existing.event_id is not null then
    if existing.plan_id<>p.id or existing.amount_cents<>coalesce(p.deposit_cents,p.total_cents) or existing.currency<>p.currency then raise exception 'Payment evidence was already applied elsewhere'; end if;
    return private.relystra_activate_paid_plan(p.id);
  end if;
  if p.status='paid' then raise exception 'This plan already has a different payment'; end if;
  insert into public.nexus_delivery_payment_events(event_id,plan_id,provider,payment_reference,amount_cents,currency,livemode,account_id)
    values(p_event_id,p.id,'stripe',p_payment_reference,p_amount_cents,p_currency,p_livemode,p_account_id);
  update public.nexus_build_plans set status='paid',paid_at=now(),payment_reference=p_payment_reference,payment_source='stripe' where id=p.id;
  return private.relystra_activate_paid_plan(p.id);
end 
$$;

create or replace function public.relystra_claim_checkout(p_plan_id uuid, p_user_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$

declare p public.nexus_build_plans%rowtype; cfg public.nexus_delivery_settings%rowtype;
begin
  select * into p from public.nexus_build_plans where id=p_plan_id for update;
  if p.id is null or not (exists(select 1 from public.nexus_platform_admins where user_id=p_user_id)
    or exists(select 1 from public.nexus_company_members where company_id=p.company_id and user_id=p_user_id and active)) then raise exception 'Company access required'; end if;
  if p.purchase_kind='diagnosis' then raise exception 'Full Diagnosis is included in the first implementation engagement'; end if;
  if p.status<>'awaiting_payment' then raise exception 'This plan is no longer awaiting payment'; end if;
  select * into cfg from public.nexus_delivery_settings where singleton;
  if exists(select 1 from public.nexus_qa_fixture_runs q where q.company_id=p.company_id and q.created_at>now()-interval '24 hours' and q.admin_user_id is not null and q.client_user_id is not null) then cfg.payment_livemode:=false; end if;
  if not cfg.checkout_enabled or cfg.stripe_account_id is null then raise exception 'Checkout is not configured yet'; end if;
  if p.purchase_kind='balance' and not exists(select 1 from public.nexus_build_plans parent where parent.id=p.parent_plan_id and parent.status='paid' and parent.company_id=p.company_id and parent.checkout_account_id=cfg.stripe_account_id and parent.checkout_livemode=cfg.payment_livemode) then raise exception 'Balance checkout must use the original payment environment'; end if;
  if p.checkout_started_at is null then
    update public.nexus_build_plans set checkout_started_at=date_trunc('second',clock_timestamp()),
      checkout_expires_at=date_trunc('second',clock_timestamp())+interval '23 hours 59 minutes',
      checkout_account_id=cfg.stripe_account_id,checkout_livemode=cfg.payment_livemode,
      checkout_integration_id='relystra_delivery_'||translate(substr(replace(gen_random_uuid()::text,'-',''),1,8),'0123456789abcdef','abcdefghijklmnop')
      where id=p.id returning * into p;
  end if;
  return to_jsonb(p);
end 
$$;

create or replace function private.relystra_activate_paid_plan(p_plan_id uuid) returns uuid language plpgsql security definer set search_path='' as $$

declare p public.nexus_build_plans%rowtype; item jsonb; project_id uuid; event public.nexus_delivery_payment_events%rowtype;
  source_run uuid; source_count integer;
begin
  select * into p from public.nexus_build_plans where id=p_plan_id for update;
  select * into event from public.nexus_delivery_payment_events where plan_id=p.id order by verified_at limit 1;
  if p.id is null or p.status<>'paid' or event.event_id is null or event.amount_cents<>coalesce(p.deposit_cents,p.total_cents) or event.currency<>p.currency then raise exception 'Verified payment matching this plan is required'; end if;
  if p.purchase_kind='balance' then select id into project_id from public.nexus_projects where build_plan_id=p.parent_plan_id; return project_id; end if;
  if p.purchase_kind='diagnosis' then
    -- Existing commercial entitlement model remains the access authority for diagnosis purchases.
    insert into public.nexus_company_entitlements(company_id,offering_code,status,source,scope,starts_at,created_by)
      select p.company_id,'find','active','purchase',jsonb_build_object('plan_id',p.id,'payment_reference',p.payment_reference,'livemode',event.livemode),now(),p.created_by
      where not exists(select 1 from public.nexus_company_entitlements where company_id=p.company_id and offering_code='find' and scope->>'plan_id'=p.id::text);
    return null;
  end if;
  if p.source_discovery_id is null then
  select (array_agg(distinct r.id order by r.id))[1],count(distinct r.id) into source_run,source_count
    from jsonb_array_elements(coalesce(p.items,'[]'::jsonb)) plan_item
    join public.nexus_diagnosis_runs r on r.id::text=plan_item->>'diagnosis_run_id' and r.company_id=p.company_id and r.status='approved';
  if source_count<>1 or exists(select 1 from jsonb_array_elements(coalesce(p.items,'[]'::jsonb)) plan_item where plan_item->>'diagnosis_run_id' is distinct from source_run::text)
    then raise exception 'A paid Build Package must retain exactly one approved diagnosis'; end if;
  else
    if jsonb_array_length(p.items)<>1 or not exists(select 1 from public.nexus_discovery_requests where id=p.source_discovery_id and company_id=p.company_id and initial_plan_id=p.id and report_approved_at is not null) then raise exception 'Initial engagement must contain its one approved Discovery Build'; end if;
  end if;
  select id into project_id from public.nexus_projects where build_plan_id=p.id;
  if project_id is not null then return project_id; end if;
  insert into public.nexus_projects(company_id,name,service_type,status,summary,created_by,project_type,owner_scope,engagement_stage,
    build_plan_id,paid_at,activated_at,scope_snapshot,package_stage,payment_livemode,context_diagnosis_run_id,source_discovery_id)
    values(p.company_id,p.name,'Build Package','active','Paid package awaiting approved Build briefs.',p.created_by,'build_package','nexus','build_test',
      p.id,p.paid_at,now(),jsonb_build_object('plan_id',p.id,'items',p.items,'total_cents',p.total_cents,'currency',p.currency,
        'duration_min',p.duration_min,'duration_max',p.duration_max,'duration_assumptions',p.duration_assumptions,'snapshot_digest',p.snapshot_digest),
      'briefs',event.livemode,source_run,p.source_discovery_id) returning id into project_id;
  for item in select value from jsonb_array_elements(p.items) loop
    insert into public.nexus_system_cards(company_id,project_id,system_code,name,purpose,owner_label,created_by,opportunity_id,build_brief,build_status,client_visible)
      values(p.company_id,project_id,'paid_'||p.id::text||'_'||(item->>'id'),item->>'name',item->>'outcome','Relystra',p.created_by,(item->>'id')::uuid,
        jsonb_build_object('scope',item,'source','paid_plan','plan_id',p.id,'requirements',item->'inputs','acceptance_criteria',item->'acceptance_criteria'),
        'brief_draft',true);
  end loop;
  if p.source_discovery_id is not null then
    insert into public.nexus_company_entitlements(company_id,offering_code,status,source,scope,starts_at,created_by)
     values(p.company_id,'find','active','purchase',jsonb_build_object('plan_id',p.id,'included_full_diagnosis',true,'livemode',event.livemode),now(),p.created_by);
    update public.nexus_discovery_requests set report_state='paid' where id=p.source_discovery_id;
    insert into public.nexus_discovery_context_entries(company_id,project_id,context_type,content,is_current,created_by)
     select p.company_id,project_id,'admin_context','Original Discovery transcript (client statements; retained source '||id::text||'): '||discovery_transcript,true,p.created_by from public.nexus_discovery_requests where id=p.source_discovery_id;
  end if;
  -- An administrator's explicit pin is preserved. Otherwise the client loader selects latest activation.
  insert into public.nexus_activity_log(company_id,actor_id,action,entity_type,entity_id,summary)
    values(p.company_id,p.created_by,'paid_package_activated','project',project_id,
      case when event.livemode then 'Paid Build Package activated: ' else 'Test-payment Build Package activated: ' end||p.name);
  return project_id;
end 
$$;

create or replace function private.relystra_require_paid_package() returns trigger language plpgsql security definer set search_path='' as $$

declare p public.nexus_build_plans%rowtype;
begin
  if new.project_type='build_package' then
    select * into p from public.nexus_build_plans where id=new.build_plan_id;
    if p.id is null or p.status<>'paid' or p.purchase_kind<>'build_package' or p.company_id is distinct from new.company_id
      or p.paid_at is distinct from new.paid_at or new.scope_snapshot->>'snapshot_digest' is distinct from p.snapshot_digest
      or new.scope_snapshot->'items' is distinct from p.items or (new.scope_snapshot->>'total_cents')::integer is distinct from p.total_cents
      or new.scope_snapshot->>'currency' is distinct from p.currency
      or new.source_discovery_id is distinct from p.source_discovery_id
      or (p.source_discovery_id is not null and (jsonb_array_length(p.items)<>1 or not exists(select 1 from public.nexus_discovery_requests d where d.id=p.source_discovery_id and d.company_id=p.company_id and d.initial_plan_id=p.id)))
      or (p.source_discovery_id is null and (new.context_diagnosis_run_id is null or not exists(select 1 from public.nexus_diagnosis_runs r where r.id=new.context_diagnosis_run_id and r.company_id=new.company_id and r.status='approved' and not exists(select 1 from jsonb_array_elements(p.items) i where i->>'diagnosis_run_id' is distinct from r.id::text))))
      or (p.source_discovery_id is not null and new.context_diagnosis_run_id is not null and not exists(select 1 from public.nexus_diagnosis_runs r where r.id=new.context_diagnosis_run_id and r.company_id=new.company_id and r.project_id=new.id and r.status='approved'))
      or not exists(select 1 from public.nexus_delivery_payment_events e where e.plan_id=p.id and e.amount_cents=coalesce(p.deposit_cents,p.total_cents)
        and e.currency=p.currency and e.livemode=new.payment_livemode and e.payment_reference=p.payment_reference) then
      raise exception 'A matching verified payment is required to activate this package'; end if;
  end if;
  return new;
end 
$$;

create or replace function private.relystra_guard_paid_scope() returns trigger language plpgsql security definer set search_path='' as $$

begin
  if tg_table_name='nexus_build_plans' then
    if (to_jsonb(new)-array['status','checkout_session_id','checkout_url','checkout_expires_at','checkout_started_at','checkout_account_id','checkout_livemode','checkout_integration_id','payment_reference','payment_source','paid_at']) is distinct from
       (to_jsonb(old)-array['status','checkout_session_id','checkout_url','checkout_expires_at','checkout_started_at','checkout_account_id','checkout_livemode','checkout_integration_id','payment_reference','payment_source','paid_at']) then raise exception 'Build Plan scope is immutable. Create a new plan to change it'; end if;
    if old.checkout_started_at is not null and (new.checkout_started_at,new.checkout_account_id,new.checkout_livemode,new.checkout_integration_id,new.checkout_expires_at)
      is distinct from (old.checkout_started_at,old.checkout_account_id,old.checkout_livemode,old.checkout_integration_id,old.checkout_expires_at) then raise exception 'Issued checkout terms are immutable'; end if;
    if old.checkout_session_id is not null and new.checkout_session_id is distinct from old.checkout_session_id then raise exception 'Checkout session is immutable'; end if;
    if old.status='paid' and to_jsonb(new) is distinct from to_jsonb(old) then raise exception 'A paid plan is immutable'; end if;
  elsif old.project_type='build_package' and
    (new.company_id is distinct from old.company_id or new.build_plan_id is distinct from old.build_plan_id or new.scope_snapshot is distinct from old.scope_snapshot
      or new.paid_at is distinct from old.paid_at or new.activated_at is distinct from old.activated_at or new.payment_livemode is distinct from old.payment_livemode or new.project_type is distinct from old.project_type or new.source_discovery_id is distinct from old.source_discovery_id or (new.context_diagnosis_run_id is distinct from old.context_diagnosis_run_id and not (old.source_discovery_id is not null and old.context_diagnosis_run_id is null and new.context_diagnosis_run_id is not null))) then
    raise exception 'Paid package identity and scope are immutable';
  end if;
  return new;
end 
$$;


create or replace function private.relystra_attach_initial_diagnosis() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status='approved' then
  update public.nexus_projects set context_diagnosis_run_id=new.id where id=new.project_id and company_id=new.company_id and source_discovery_id is not null and context_diagnosis_run_id is null;
 end if;
 return new;
end $$;
create trigger relystra_initial_diagnosis_lineage after insert or update of status on public.nexus_diagnosis_runs for each row execute function private.relystra_attach_initial_diagnosis();
create or replace function public.relystra_create_balance_plan(p_plan_id uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare p public.nexus_build_plans%rowtype; child uuid; amount integer; item jsonb;
begin
 select * into p from public.nexus_build_plans where id=p_plan_id for update;
 if auth.uid() is null or not (public.nexus_is_platform_admin() or public.nexus_is_company_member(p.company_id)) then raise exception 'Company access required'; end if;
 if p.id is null or p.status<>'paid' or p.purchase_kind<>'build_package' then raise exception 'Paid engagement required'; end if;
 amount:=p.total_cents-coalesce(p.deposit_cents,p.total_cents);
 if amount<1 then raise exception 'No balance is due'; end if;
 select id into child from public.nexus_build_plans where parent_plan_id=p.id and purchase_kind='balance' and status<>'cancelled';
 if child is not null then return child; end if;
 item:=jsonb_build_array(jsonb_build_object('name','Remaining balance: '||p.name,'price_cents',amount,'currency',p.currency));
 insert into public.nexus_build_plans(company_id,purchase_kind,name,items,total_cents,currency,duration_assumptions,snapshot_digest,created_by,parent_plan_id)
 values(p.company_id,'balance','Remaining balance: '||p.name,item,amount,p.currency,'{}',md5(p.snapshot_digest||':balance:'||amount::text),auth.uid(),p.id) returning id into child;
 return child;
end $$;
create or replace function public.relystra_payment_summary(p_company_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not (public.nexus_is_platform_admin() or public.nexus_is_company_member(p_company_id)) then raise exception 'Company access required'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('plan_id',p.id,'total_cents',p.total_cents,'required_deposit_cents',coalesce(p.deposit_cents,p.total_cents),'paid_cents',coalesce(s.paid,0),'balance_cents',p.total_cents-coalesce(s.paid,0),'currency',p.currency))
 from public.nexus_build_plans p left join lateral (select sum(e.amount_cents) paid from public.nexus_delivery_payment_events e join public.nexus_build_plans ep on ep.id=e.plan_id where ep.id=p.id or ep.parent_plan_id=p.id) s on true
 where p.company_id=p_company_id and p.purchase_kind='build_package' and p.status<>'cancelled'),'[]');
end $$;

create or replace function private.relystra_create_diagnosis_plan(p_company_id uuid) returns uuid language plpgsql security definer set search_path='' as $$ begin raise exception 'Full Diagnosis is included in the first implementation engagement. Review the Basic Report.'; end $$;
create or replace function private.relystra_set_build_task(p_task_id uuid, p_complete boolean, p_note text default null) returns uuid language plpgsql security definer set search_path='' as $$

declare t public.nexus_tasks%rowtype; b public.nexus_system_cards%rowtype; p public.nexus_projects%rowtype;
begin
  if auth.uid() is null or not public.nexus_is_platform_admin() then raise exception 'Relystra administrator access required'; end if;
  select * into t from public.nexus_tasks where id=p_task_id and work_kind='build_task';
  select * into p from public.nexus_projects where id=t.project_id and project_type='build_package' for update;
  select * into b from public.nexus_system_cards where id=t.build_id and project_id=t.project_id and company_id=t.company_id for update;
  select * into t from public.nexus_tasks where id=p_task_id and work_kind='build_task' for update;
  if t.id is null or b.id is null or p.id is null or b.brief_approved_at is null or p.paid_at is null then raise exception 'Approved paid Build Brief required'; end if;
  if p.package_stage not in ('briefs','building','revisions') then raise exception 'Build Tasks are locked during review and after delivery'; end if;
  if not p_complete and exists(select 1 from public.nexus_tasks where dependency_task_id=t.id and work_kind='build_task' and status in ('completed','approved','done')) then
    raise exception 'Reopen the dependent task first'; end if;
  perform pg_advisory_xact_lock(72635901);
  if p_complete or b.build_status not in ('building','revision') then
    if exists(select 1 from jsonb_array_elements_text(coalesce(b.build_brief#>'{scope,dependencies}','[]')) dep where not exists(select 1 from public.nexus_system_cards prerequisite where prerequisite.opportunity_id::text=dep and prerequisite.company_id=b.company_id and (prerequisite.build_status='complete' or (prerequisite.project_id=b.project_id and prerequisite.build_status='ready_for_review' and prerequisite.internal_qa->>'content_digest'=md5(prerequisite.delivery_content::text))))) then raise exception 'This Build is queued until its prerequisites are delivered'; end if;
    if b.build_status not in ('building','revision') and (select count(*) from public.nexus_system_cards active join public.nexus_projects ap on ap.id=active.project_id where active.build_status in ('building','qa','revision') and ap.project_type='build_package' and ap.package_stage not in ('support','completed')) >= (select parallel_capacity from public.nexus_delivery_settings where singleton) then raise exception 'Delivery capacity is occupied. This Build remains queued'; end if;
  end if;
  update public.nexus_tasks set status=case when p_complete then 'completed' else 'open' end,
    completed_at=case when p_complete then now() else null end,review_note=p_note,updated_at=now(),notify_client=false where id=t.id;
  update public.nexus_system_cards set build_status='building',updated_at=now() where id=b.id;
  update public.nexus_projects set package_stage=case when package_stage='briefs' then 'building' else package_stage end,updated_at=now() where id=p.id;
  return t.id;
end 
$$;

create or replace function private.relystra_publish_final(p_project_id uuid) returns uuid language plpgsql security definer set search_path='' as $$

declare p public.nexus_projects%rowtype; b public.nexus_system_cards%rowtype; final_id uuid:=gen_random_uuid(); count_builds integer:=0;
begin
  if exists(select 1 from public.nexus_projects proj join public.nexus_build_plans plan on plan.id=proj.build_plan_id where proj.id=p_project_id and plan.total_cents>coalesce(plan.deposit_cents,plan.total_cents) and not exists(select 1 from public.nexus_build_plans balance where balance.parent_plan_id=plan.id and balance.purchase_kind='balance' and balance.status='paid')) then raise exception 'Settle the accepted balance before final handoff'; end if;
  if auth.uid() is null or not public.nexus_is_platform_admin() then raise exception 'Relystra administrator access required'; end if;
  select * into p from public.nexus_projects where id=p_project_id and project_type='build_package' for update;
  if p.final_package is not null then return (p.final_package->>'id')::uuid; end if;
  if p.id is null or p.package_stage<>'final_qa' then raise exception 'Client review and final QA must precede final delivery'; end if;
  for b in select * from public.nexus_system_cards where project_id=p.id and opportunity_id is not null order by id for update loop
    count_builds:=count_builds+1;
    if b.final_qa->>'content_digest' is distinct from md5(b.delivery_content::text) or b.client_review->>'decision' is distinct from 'approve'
      or b.client_review->>'content_digest' is distinct from md5(b.delivery_content::text)
      or exists(select 1 from public.nexus_tasks where build_id=b.id and work_kind='build_task' and (archived_at is not null or status not in ('completed','approved','done'))) then
      raise exception 'Every Build needs client acceptance and current final QA'; end if;
    perform private.relystra_validate_qa(b.final_qa->'checks',true);
    perform private.relystra_validate_delivery(b.delivery_content,true);
  end loop;
  if count_builds=0 or count_builds<>jsonb_array_length(p.scope_snapshot->'items') then raise exception 'The Final Package must contain every purchased Build'; end if;
  update public.nexus_system_cards set build_status='complete',updated_at=now() where project_id=p.id and opportunity_id is not null;
  update public.nexus_projects set final_package=jsonb_build_object('id',final_id,'published_at',now(),'published_by',auth.uid(),
      'plan_id',build_plan_id,'scope_digest',scope_snapshot->>'snapshot_digest','items',private.relystra_package_items(p.id)),
    package_stage='support',support_starts_at=now(),support_ends_at=now()+interval '7 days',updated_at=now() where id=p.id;
  insert into public.nexus_activity_log(company_id,actor_id,action,entity_type,entity_id,summary)
    values(p.company_id,auth.uid(),'final_package_published','project',p.id,'Final Package delivered. Seven-day light support begins.');
  return final_id;
end 
$$;

revoke all on function public.relystra_save_basic_report(uuid,uuid,jsonb,text,jsonb,boolean) from public,anon; grant execute on function public.relystra_save_basic_report(uuid,uuid,jsonb,text,jsonb,boolean) to authenticated;
revoke all on function public.relystra_share_basic_report(uuid) from public,anon; grant execute on function public.relystra_share_basic_report(uuid) to authenticated;
revoke all on function public.relystra_create_balance_plan(uuid) from public,anon; grant execute on function public.relystra_create_balance_plan(uuid) to authenticated;
revoke all on function public.relystra_payment_summary(uuid) from public,anon; grant execute on function public.relystra_payment_summary(uuid) to authenticated;
revoke all on function public.relystra_basic_report_access(text,text) from public,anon,authenticated; grant execute on function public.relystra_basic_report_access(text,text) to service_role;
revoke all on function private.relystra_attach_initial_diagnosis() from public,anon,authenticated;

create or replace function public.relystra_complete_initial_invite(p_plan_id uuid,p_user_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare p public.nexus_build_plans%rowtype; d public.nexus_discovery_requests%rowtype;
begin
 select * into p from public.nexus_build_plans where id=p_plan_id and status='paid';
 select * into d from public.nexus_discovery_requests where id=p.source_discovery_id and company_id=p.company_id and initial_plan_id=p.id for update;
 if d.id is null then raise exception 'Verified initial engagement required'; end if;
 if d.invited_user_id is not null then return; end if;
 perform public.relystra_queue_client_invite(p_user_id,d.company_id,d.report_approved_by,d.email,d.full_name);
 update public.nexus_discovery_requests set invited_user_id=p_user_id where id=d.id;
end $$;
revoke all on function public.relystra_complete_initial_invite(uuid,uuid) from public,anon,authenticated;
grant execute on function public.relystra_complete_initial_invite(uuid,uuid) to service_role;
commit;

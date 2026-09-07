-- Only trusted payment verification can activate a Build Package. No browser-supplied paid flag.
begin;
alter table public.nexus_build_plans add column checkout_started_at timestamptz,
  add column checkout_account_id text,add column checkout_livemode boolean,
  add column checkout_integration_id text;
create table public.nexus_delivery_payment_events (
  event_id text primary key,plan_id uuid not null references public.nexus_build_plans(id),
  provider text not null check(provider in ('stripe','manual')),
  payment_reference text not null,amount_cents integer not null check(amount_cents>0),currency text not null,
  livemode boolean not null,account_id text,verified_at timestamptz not null default now(),
  verified_by uuid references auth.users(id),evidence_note text,
  unique(provider,payment_reference)
);
alter table public.nexus_delivery_payment_events enable row level security;
create policy relystra_payment_admin_read on public.nexus_delivery_payment_events for select to authenticated using(public.nexus_is_platform_admin());
grant select on public.nexus_delivery_payment_events to authenticated;
grant select on public.nexus_delivery_settings,public.nexus_delivery_payment_events to service_role;
grant select,update on public.nexus_build_plans to service_role;
alter table public.nexus_projects add column payment_livemode boolean;

create or replace function private.relystra_activate_paid_plan(p_plan_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare p public.nexus_build_plans%rowtype; item jsonb; project_id uuid; event public.nexus_delivery_payment_events%rowtype;
begin
  select * into p from public.nexus_build_plans where id=p_plan_id for update;
  select * into event from public.nexus_delivery_payment_events where plan_id=p.id order by verified_at limit 1;
  if p.id is null or p.status<>'paid' or event.event_id is null or event.amount_cents<>p.total_cents or event.currency<>p.currency then raise exception 'Verified payment matching this plan is required'; end if;
  if p.purchase_kind='diagnosis' then
    -- Existing commercial entitlement model remains the access authority for diagnosis purchases.
    insert into public.nexus_company_entitlements(company_id,offering_code,status,source,scope,starts_at,created_by)
      select p.company_id,'find','active','purchase',jsonb_build_object('plan_id',p.id,'payment_reference',p.payment_reference,'livemode',event.livemode),now(),p.created_by
      where not exists(select 1 from public.nexus_company_entitlements where company_id=p.company_id and offering_code='find' and scope->>'plan_id'=p.id::text);
    return null;
  end if;
  select id into project_id from public.nexus_projects where build_plan_id=p.id;
  if project_id is not null then return project_id; end if;
  insert into public.nexus_projects(company_id,name,service_type,status,summary,created_by,project_type,owner_scope,engagement_stage,
    build_plan_id,paid_at,activated_at,scope_snapshot,package_stage,payment_livemode)
    values(p.company_id,p.name,'Build Package','active','Paid package awaiting approved Build briefs.',p.created_by,'build_package','nexus','build_test',
      p.id,p.paid_at,now(),jsonb_build_object('plan_id',p.id,'items',p.items,'total_cents',p.total_cents,'currency',p.currency,
        'duration_min',p.duration_min,'duration_max',p.duration_max,'duration_assumptions',p.duration_assumptions,'snapshot_digest',p.snapshot_digest),
      'briefs',event.livemode) returning id into project_id;
  for item in select value from jsonb_array_elements(p.items) loop
    insert into public.nexus_system_cards(company_id,project_id,system_code,name,purpose,owner_label,created_by,opportunity_id,build_brief,build_status,client_visible)
      values(p.company_id,project_id,'paid_'||p.id::text||'_'||(item->>'id'),item->>'name',item->>'outcome','Relystra',p.created_by,(item->>'id')::uuid,
        jsonb_build_object('scope',item,'source','paid_plan','plan_id',p.id,'requirements',item->'inputs','acceptance_criteria',item->'acceptance_criteria'),
        'brief_draft',true);
  end loop;
  -- An administrator's explicit pin is preserved. Otherwise the client loader selects latest activation.
  insert into public.nexus_activity_log(company_id,actor_id,action,entity_type,entity_id,summary)
    values(p.company_id,p.created_by,'paid_package_activated','project',project_id,
      case when event.livemode then 'Paid Build Package activated: ' else 'Test-payment Build Package activated: ' end||p.name);
  return project_id;
end $$;

create or replace function public.relystra_record_verified_payment(p_plan_id uuid,p_event_id text,p_session_id text,p_payment_reference text,
  p_amount_cents integer,p_currency text,p_livemode boolean,p_snapshot_digest text,p_account_id text)
returns uuid language plpgsql security definer set search_path='' as $$
declare p public.nexus_build_plans%rowtype; existing public.nexus_delivery_payment_events%rowtype;
begin
  -- Execution is granted only to service_role. The Edge Function verifies the raw Stripe signature,
  -- account, application metadata, checkout session and paid status before calling this RPC.
  select * into p from public.nexus_build_plans where id=p_plan_id for update;
  if p.id is null or p.status='cancelled' then raise exception 'Payable plan not found'; end if;
  if p.checkout_session_id is distinct from p_session_id or p_session_id is null or p.snapshot_digest is distinct from p_snapshot_digest then raise exception 'Payment does not match the issued checkout session and scope'; end if;
  if p.total_cents is distinct from p_amount_cents or p.currency is distinct from p_currency or p.checkout_livemode is distinct from p_livemode
    or p.checkout_account_id is distinct from p_account_id or p_account_id is null then raise exception 'Payment amount, currency or environment mismatch'; end if;
  if nullif(p_event_id,'') is null or nullif(p_payment_reference,'') is null then raise exception 'Payment evidence is required'; end if;
  select * into existing from public.nexus_delivery_payment_events where event_id=p_event_id or (provider='stripe' and payment_reference=p_payment_reference);
  if existing.event_id is not null then
    if existing.plan_id<>p.id or existing.amount_cents<>p.total_cents or existing.currency<>p.currency then raise exception 'Payment evidence was already applied elsewhere'; end if;
    return private.relystra_activate_paid_plan(p.id);
  end if;
  if p.status='paid' then raise exception 'This plan already has a different payment'; end if;
  insert into public.nexus_delivery_payment_events(event_id,plan_id,provider,payment_reference,amount_cents,currency,livemode,account_id)
    values(p_event_id,p.id,'stripe',p_payment_reference,p_amount_cents,p_currency,p_livemode,p_account_id);
  update public.nexus_build_plans set status='paid',paid_at=now(),payment_reference=p_payment_reference,payment_source='stripe' where id=p.id;
  return private.relystra_activate_paid_plan(p.id);
end $$;

create or replace function private.relystra_manual_payment(p_plan_id uuid,p_reference text,p_note text)
returns uuid language plpgsql security definer set search_path='' as $$
declare p public.nexus_build_plans%rowtype; cfg public.nexus_delivery_settings%rowtype;
begin
  if auth.uid() is null or not public.nexus_is_platform_admin() then raise exception 'Relystra administrator access required'; end if;
  select * into cfg from public.nexus_delivery_settings where singleton;
  if not cfg.manual_payment_enabled then raise exception 'Manual payment fallback is disabled'; end if;
  if length(btrim(coalesce(p_note,'')))<20 or nullif(btrim(p_reference),'') is null then raise exception 'Record the external payment reference and the reason for this override'; end if;
  select * into p from public.nexus_build_plans where id=p_plan_id for update;
  if p.id is null or p.status<>'awaiting_payment' or p.checkout_started_at is not null then raise exception 'Use an unpaid plan with no open checkout session'; end if;
  insert into public.nexus_delivery_payment_events(event_id,plan_id,provider,payment_reference,amount_cents,currency,livemode,verified_by,evidence_note)
    values('manual_'||gen_random_uuid()::text,p.id,'manual',btrim(p_reference),p.total_cents,p.currency,cfg.payment_livemode,auth.uid(),btrim(p_note));
  update public.nexus_build_plans set status='paid',paid_at=now(),payment_reference=btrim(p_reference),payment_source='manual' where id=p.id;
  insert into public.nexus_activity_log(company_id,actor_id,action,entity_type,entity_id,summary)
    values(p.company_id,auth.uid(),'manual_payment_override','build_plan',p.id,btrim(p_note));
  return private.relystra_activate_paid_plan(p.id);
end $$;
create or replace function public.relystra_manual_payment(p_plan_id uuid,p_reference text,p_note text)
returns uuid language sql security invoker set search_path='' as $$ select private.relystra_manual_payment(p_plan_id,p_reference,p_note) $$;

create or replace function private.relystra_guard_paid_scope()
returns trigger language plpgsql set search_path='' as $$
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
      or new.paid_at is distinct from old.paid_at or new.activated_at is distinct from old.activated_at or new.payment_livemode is distinct from old.payment_livemode or new.project_type is distinct from old.project_type) then
    raise exception 'Paid package identity and scope are immutable';
  end if;
  return new;
end $$;
create trigger relystra_plan_scope_immutable before update on public.nexus_build_plans for each row execute function private.relystra_guard_paid_scope();
create trigger relystra_project_scope_immutable before update on public.nexus_projects for each row execute function private.relystra_guard_paid_scope();

create or replace function private.relystra_require_paid_package()
returns trigger language plpgsql security definer set search_path='' as $$
declare p public.nexus_build_plans%rowtype;
begin
  if new.project_type='build_package' then
    select * into p from public.nexus_build_plans where id=new.build_plan_id;
    if p.id is null or p.status<>'paid' or p.purchase_kind<>'build_package' or p.company_id is distinct from new.company_id
      or p.paid_at is distinct from new.paid_at or new.scope_snapshot->>'snapshot_digest' is distinct from p.snapshot_digest
      or new.scope_snapshot->'items' is distinct from p.items or (new.scope_snapshot->>'total_cents')::integer is distinct from p.total_cents
      or new.scope_snapshot->>'currency' is distinct from p.currency
      or not exists(select 1 from public.nexus_delivery_payment_events e where e.plan_id=p.id and e.amount_cents=p.total_cents
        and e.currency=p.currency and e.livemode=new.payment_livemode and e.payment_reference=p.payment_reference) then
      raise exception 'A matching verified payment is required to activate this package'; end if;
  end if;
  return new;
end $$;
create trigger relystra_project_verified_payment before insert or update on public.nexus_projects
  for each row execute function private.relystra_require_paid_package();

create or replace function private.relystra_create_diagnosis_plan(p_company_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare cfg public.nexus_delivery_settings%rowtype; plan_id uuid; items jsonb;
begin
  if auth.uid() is null or not (public.nexus_is_platform_admin() or public.nexus_is_company_member(p_company_id)) then raise exception 'Company access required'; end if;
  -- Serialize repeated clicks for the same company before looking up its existing plan.
  perform 1 from public.nexus_companies where id=p_company_id for update;
  if not found then raise exception 'Client not found'; end if;
  select id into plan_id from public.nexus_build_plans where company_id=p_company_id and purchase_kind='diagnosis' and status='awaiting_payment' order by created_at desc limit 1;
  if plan_id is not null then return plan_id; end if;
  if exists(select 1 from public.nexus_company_entitlements where company_id=p_company_id and offering_code='find' and status='active'
    and starts_at<=now() and (ends_at is null or ends_at>now())) then raise exception 'This client already has diagnosis access'; end if;
  select * into cfg from public.nexus_delivery_settings where singleton;
  items:=jsonb_build_array(jsonb_build_object('name','Operational Diagnosis','price_cents',cfg.diagnosis_price_cents,'currency',cfg.currency,
    'includes',jsonb_build_array('Structured operational analysis','Workflow findings','Missing-information review','Pre-build Actions','Preliminary Build roadmap')));
  insert into public.nexus_build_plans(company_id,purchase_kind,name,items,total_cents,currency,snapshot_digest,created_by)
    values(p_company_id,'diagnosis','Operational Diagnosis',items,cfg.diagnosis_price_cents,cfg.currency,
      md5(items::text||':'||cfg.diagnosis_price_cents::text||':'||cfg.currency),auth.uid()) returning id into plan_id;
  return plan_id;
end $$;
create or replace function public.relystra_create_diagnosis_plan(p_company_id uuid)
returns uuid language sql security invoker set search_path='' as $$ select private.relystra_create_diagnosis_plan(p_company_id) $$;

-- Service-only checkout operations receive a user ID validated with auth.getUser at the Edge boundary.
create or replace function public.relystra_claim_checkout(p_plan_id uuid,p_user_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.nexus_build_plans%rowtype; cfg public.nexus_delivery_settings%rowtype;
begin
  select * into p from public.nexus_build_plans where id=p_plan_id for update;
  if p.id is null or not (exists(select 1 from public.nexus_platform_admins where user_id=p_user_id)
    or exists(select 1 from public.nexus_company_members where company_id=p.company_id and user_id=p_user_id and active)) then raise exception 'Company access required'; end if;
  if p.status<>'awaiting_payment' then raise exception 'This plan is no longer awaiting payment'; end if;
  select * into cfg from public.nexus_delivery_settings where singleton;
  if not cfg.checkout_enabled or cfg.stripe_account_id is null then raise exception 'Checkout is not configured yet'; end if;
  if p.checkout_started_at is null then
    update public.nexus_build_plans set checkout_started_at=date_trunc('second',clock_timestamp()),
      checkout_expires_at=date_trunc('second',clock_timestamp())+interval '23 hours 59 minutes',
      checkout_account_id=cfg.stripe_account_id,checkout_livemode=cfg.payment_livemode,
      checkout_integration_id='relystra_delivery_'||translate(substr(replace(gen_random_uuid()::text,'-',''),1,8),'0123456789abcdef','abcdefghijklmnop')
      where id=p.id returning * into p;
  end if;
  return to_jsonb(p);
end $$;

create or replace function public.relystra_bind_checkout(p_plan_id uuid,p_session_id text,p_url text,p_account_id text,p_livemode boolean,p_expires_at timestamptz)
returns void language plpgsql security definer set search_path='' as $$
declare p public.nexus_build_plans%rowtype;
begin
  select * into p from public.nexus_build_plans where id=p_plan_id for update;
  if p.id is null or p.checkout_started_at is null or p.checkout_account_id is distinct from p_account_id
    or p.checkout_livemode is distinct from p_livemode or p.checkout_expires_at is distinct from p_expires_at then raise exception 'Checkout terms mismatch'; end if;
  if p.checkout_session_id=p_session_id then return; end if;
  if p.status<>'awaiting_payment' or p.checkout_session_id is not null or nullif(p_session_id,'') is null or p_url !~ '^https://checkout\.stripe\.com/' or p_url is null then
    raise exception 'Cannot bind this checkout session'; end if;
  update public.nexus_build_plans set checkout_session_id=p_session_id,checkout_url=p_url where id=p.id;
end $$;

create or replace function public.relystra_cancel_verified_plan(p_plan_id uuid,p_user_id uuid,p_expired_session_id text default null)
returns void language plpgsql security definer set search_path='' as $$
declare p public.nexus_build_plans%rowtype;
begin
  select * into p from public.nexus_build_plans where id=p_plan_id for update;
  if p.id is null or not (exists(select 1 from public.nexus_platform_admins where user_id=p_user_id)
    or exists(select 1 from public.nexus_company_members where company_id=p.company_id and user_id=p_user_id and active)) then raise exception 'Company access required'; end if;
  if p.status='cancelled' then return; end if;
  if p.status='paid' then raise exception 'A paid plan cannot be cancelled'; end if;
  if p.checkout_session_id is not null and p.checkout_session_id is distinct from p_expired_session_id then
    raise exception 'Expire the issued checkout before cancelling this plan'; end if;
  update public.nexus_build_plans set status='cancelled' where id=p.id;
  insert into public.nexus_activity_log(company_id,actor_id,action,entity_type,entity_id,summary)
    values(p.company_id,p_user_id,'build_plan_cancelled','build_plan',p.id,'Unpaid plan cancelled; selected Builds remain available.');
end $$;

revoke all on function private.relystra_require_paid_package() from public,anon,authenticated;
revoke all on function private.relystra_create_diagnosis_plan(uuid),public.relystra_create_diagnosis_plan(uuid) from public,anon;
grant execute on function private.relystra_create_diagnosis_plan(uuid),public.relystra_create_diagnosis_plan(uuid) to authenticated;
revoke all on function public.relystra_claim_checkout(uuid,uuid),public.relystra_bind_checkout(uuid,text,text,text,boolean,timestamptz),public.relystra_cancel_verified_plan(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.relystra_claim_checkout(uuid,uuid),public.relystra_bind_checkout(uuid,text,text,text,boolean,timestamptz),public.relystra_cancel_verified_plan(uuid,uuid,text) to service_role;

revoke all on function private.relystra_activate_paid_plan(uuid),private.relystra_guard_paid_scope() from public,anon,authenticated;
revoke all on function public.relystra_record_verified_payment(uuid,text,text,text,integer,text,boolean,text,text) from public,anon,authenticated;
grant execute on function public.relystra_record_verified_payment(uuid,text,text,text,integer,text,boolean,text,text) to service_role;
revoke all on function private.relystra_manual_payment(uuid,text,text),public.relystra_manual_payment(uuid,text,text) from public,anon;
grant execute on function private.relystra_manual_payment(uuid,text,text),public.relystra_manual_payment(uuid,text,text) to authenticated;
commit;

-- Preserve one canonical diagnosis and its evidence across paid project handoffs.
begin;
alter table public.nexus_projects add column if not exists context_diagnosis_run_id uuid references public.nexus_diagnosis_runs(id) on delete restrict;
create index if not exists nexus_projects_context_diagnosis_idx on public.nexus_projects(context_diagnosis_run_id) where context_diagnosis_run_id is not null;

with lineage as (
  select p.id,(array_agg(distinct r.id order by r.id))[1] diagnosis_id
  from public.nexus_projects p
  cross join lateral jsonb_array_elements(coalesce(p.scope_snapshot->'items','[]'::jsonb)) item
  left join public.nexus_diagnosis_runs r on r.id::text=item->>'diagnosis_run_id' and r.company_id=p.company_id and r.status='approved'
  where p.project_type='build_package' and p.context_diagnosis_run_id is null
  group by p.id having count(distinct r.id)=1 and count(*)=count(r.id)
)
update public.nexus_projects p set context_diagnosis_run_id=lineage.diagnosis_id from lineage where p.id=lineage.id;

create or replace function private.relystra_create_build_plan(p_company_id uuid,p_build_ids uuid[],p_name text)
returns uuid language plpgsql security definer set search_path='' as $$
declare o public.nexus_opportunities%rowtype; cfg public.nexus_delivery_settings%rowtype; items jsonb:='[]'; dep text;
  total bigint:=0; min_days integer; max_days integer; count_ids integer; plan_id uuid; source_run uuid;
begin
  if auth.uid() is null or not (public.nexus_is_platform_admin() or public.nexus_is_company_member(p_company_id)) then raise exception 'Company access required'; end if;
  select count(distinct id) into count_ids from unnest(p_build_ids) id;
  if count_ids=0 or count_ids<>cardinality(p_build_ids) or count_ids>25 then raise exception 'Select between one and 25 distinct Builds'; end if;
  select * into cfg from public.nexus_delivery_settings where singleton;
  -- Lock the selected opportunities in deterministic order so their approved terms cannot change mid-snapshot.
  if exists(select 1 from public.nexus_tasks where company_id=p_company_id and work_kind='prebuild_action' and archived_at is null
    and (action_review_state='suggested' or (action_review_state='approved' and status not in ('completed','approved','done','not_applicable')))) then
    raise exception 'Complete and review the required pre-build inputs first'; end if;
  for o in select * from public.nexus_opportunities where id=any(p_build_ids) order by id for update loop
    if o.company_id<>p_company_id or o.build_review_state is distinct from 'approved' or exists(select 1 from public.nexus_system_cards where opportunity_id=o.id) then raise exception 'Each selected Build must be approved and available for this client'; end if;
    if o.source_diagnosis_run_id is null then raise exception 'Each selected Build must retain an approved diagnosis'; end if;
    if source_run is null then source_run:=o.source_diagnosis_run_id;
    elsif source_run is distinct from o.source_diagnosis_run_id then raise exception 'All Builds in one package must come from the same approved diagnosis'; end if;
    if o.build_spec->>'currency' is distinct from cfg.currency then raise exception 'Build pricing needs review in the configured currency'; end if;
    if exists(select 1 from public.nexus_build_plans p,jsonb_array_elements(p.items) i where p.company_id=p_company_id and p.status='awaiting_payment' and (i->>'id')::uuid=o.id) then raise exception 'A selected Build is already in an unpaid plan. Open that plan or cancel it first'; end if;
    if jsonb_typeof(coalesce(o.build_spec->'dependencies','[]'))<>'array' then raise exception 'Build dependencies need administrator review'; end if;
    for dep in select jsonb_array_elements_text(coalesce(o.build_spec->'dependencies','[]')) loop
      if dep::uuid=o.id then raise exception 'A Build cannot depend on itself'; end if;
      if not dep::uuid=any(p_build_ids) and not exists(select 1 from public.nexus_system_cards where opportunity_id=dep::uuid and company_id=p_company_id and build_status='complete') then
        raise exception 'Include the required dependency or wait for its delivery'; end if;
    end loop;
    items:=items||jsonb_build_array(private.relystra_client_build(o));total:=total+(o.build_spec->>'price_cents')::integer;
  end loop;
  if jsonb_array_length(items)<>count_ids then raise exception 'One or more selected Builds could not be found'; end if;
  if exists(
    with recursive paths as (
      select i->>'id' as id,array[i->>'id'] as path,false as cycle from jsonb_array_elements(items) i
      union all select d.value,p.path||d.value,d.value=any(p.path) from paths p
        join lateral (select i from jsonb_array_elements(items) i where i->>'id'=p.id) q on true
        join lateral jsonb_array_elements_text(coalesce(q.i->'dependencies','[]')) d on true where not p.cycle
    ) select 1 from paths where cycle
  ) then raise exception 'Build dependencies contain a cycle'; end if;
  with recursive paths as (
    select i->>'id' as id,(i->>'duration_min')::integer as lo,(i->>'duration_max')::integer as hi from jsonb_array_elements(items) i
    union all select child->>'id',p.lo+(child->>'duration_min')::integer,p.hi+(child->>'duration_max')::integer from paths p
      join lateral (select i as child from jsonb_array_elements(items) i where coalesce(i->'dependencies','[]') ? p.id) q on true
  ) select greatest(max(lo),ceil((select sum((i->>'duration_min')::integer) from jsonb_array_elements(items) i)::numeric/cfg.parallel_capacity)::integer)+cfg.qa_days+cfg.client_review_days,
    greatest(max(hi),ceil((select sum((i->>'duration_max')::integer) from jsonb_array_elements(items) i)::numeric/cfg.parallel_capacity)::integer)+cfg.qa_days+cfg.client_review_days
    into min_days,max_days from paths;
  insert into public.nexus_build_plans(company_id,purchase_kind,name,items,total_cents,currency,duration_min,duration_max,duration_assumptions,snapshot_digest,created_by)
    values(p_company_id,'build_package',coalesce(nullif(btrim(p_name),''),'Build Package'),items,total::integer,cfg.currency,min_days,max_days,
      jsonb_build_object('parallel_capacity',cfg.parallel_capacity,'qa_days',cfg.qa_days,'client_review_days',cfg.client_review_days,'unit','business_days','starts','after briefs and required access are approved'),
      md5(items::text||':'||total::text||':'||cfg.currency),auth.uid()) returning id into plan_id;
  return plan_id;
end $$;

create or replace function private.relystra_activate_paid_plan(p_plan_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare p public.nexus_build_plans%rowtype; item jsonb; project_id uuid; event public.nexus_delivery_payment_events%rowtype;
  source_run uuid; source_count integer;
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
  select (array_agg(distinct r.id order by r.id))[1],count(distinct r.id) into source_run,source_count
    from jsonb_array_elements(coalesce(p.items,'[]'::jsonb)) plan_item
    join public.nexus_diagnosis_runs r on r.id::text=plan_item->>'diagnosis_run_id' and r.company_id=p.company_id and r.status='approved';
  if source_count<>1 or exists(select 1 from jsonb_array_elements(coalesce(p.items,'[]'::jsonb)) plan_item where plan_item->>'diagnosis_run_id' is distinct from source_run::text)
    then raise exception 'A paid Build Package must retain exactly one approved diagnosis'; end if;
  select id into project_id from public.nexus_projects where build_plan_id=p.id;
  if project_id is not null then return project_id; end if;
  insert into public.nexus_projects(company_id,name,service_type,status,summary,created_by,project_type,owner_scope,engagement_stage,
    build_plan_id,paid_at,activated_at,scope_snapshot,package_stage,payment_livemode,context_diagnosis_run_id)
    values(p.company_id,p.name,'Build Package','active','Paid package awaiting approved Build briefs.',p.created_by,'build_package','nexus','build_test',
      p.id,p.paid_at,now(),jsonb_build_object('plan_id',p.id,'items',p.items,'total_cents',p.total_cents,'currency',p.currency,
        'duration_min',p.duration_min,'duration_max',p.duration_max,'duration_assumptions',p.duration_assumptions,'snapshot_digest',p.snapshot_digest),
      'briefs',event.livemode,source_run) returning id into project_id;
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
      or new.paid_at is distinct from old.paid_at or new.activated_at is distinct from old.activated_at or new.payment_livemode is distinct from old.payment_livemode or new.project_type is distinct from old.project_type or new.context_diagnosis_run_id is distinct from old.context_diagnosis_run_id) then
    raise exception 'Paid package identity and scope are immutable';
  end if;
  return new;
end $$;

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
      or new.context_diagnosis_run_id is null
      or not exists(
        select 1 from public.nexus_diagnosis_runs r
        where r.id=new.context_diagnosis_run_id and r.company_id=new.company_id and r.status='approved'
          and not exists(select 1 from jsonb_array_elements(coalesce(p.items,'[]'::jsonb)) item where item->>'diagnosis_run_id' is distinct from r.id::text)
      )
      or not exists(select 1 from public.nexus_delivery_payment_events e where e.plan_id=p.id and e.amount_cents=p.total_cents
        and e.currency=p.currency and e.livemode=new.payment_livemode and e.payment_reference=p.payment_reference) then
      raise exception 'A matching verified payment is required to activate this package'; end if;
  end if;
  return new;
end $$;

create or replace function private.relystra_workspace_snapshot(p_company_id uuid,p_project_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare p public.nexus_projects%rowtype; d public.nexus_diagnosis_runs%rowtype; actions jsonb; builds jsonb; projects jsonb; diagnosis_access boolean; cfg public.nexus_delivery_settings%rowtype;
begin
  if auth.uid() is null or not (public.nexus_is_platform_admin() or public.nexus_is_company_member(p_company_id)) then raise exception 'Client workspace access required'; end if;
  if not exists(select 1 from public.nexus_companies where id=p_company_id) then raise exception 'Client not found'; end if;
  if p_project_id is not null then
    select * into p from public.nexus_projects where id=p_project_id and company_id=p_company_id;
    if p.id is null then raise exception 'Project does not belong to this client'; end if;
  else
    select x.* into p from public.nexus_projects x left join public.nexus_active_engagements a on a.company_id=x.company_id and a.project_id=x.id
      where x.company_id=p_company_id and x.status not in ('complete','completed','cancelled','canceled','archived')
        and ((x.paid_at is not null and x.activated_at is not null) or a.project_id is not null)
      order by (a.project_id is not null) desc,x.activated_at desc nulls last,x.id limit 1;
  end if;
  if p.context_diagnosis_run_id is not null then
    select r.* into d from public.nexus_diagnosis_runs r
      where r.id=p.context_diagnosis_run_id and r.company_id=p_company_id and r.status<>'draft';
  end if;
  if d.id is null then
    select r.* into d from public.nexus_diagnosis_runs r
      where r.company_id=p_company_id and r.status<>'draft'
        and exists(select 1 from jsonb_array_elements(coalesce(p.scope_snapshot->'items','[]')) item where item->>'diagnosis_run_id'=r.id::text)
      order by r.created_at desc,r.id limit 1;
  end if;
  if d.id is null then
    select r.* into d from public.nexus_diagnosis_runs r where r.company_id=p_company_id
      and (p.id is null or r.project_id is null or r.project_id=p.id)
      and r.status<>'draft' order by r.created_at desc,r.id limit 1;
  end if;
  diagnosis_access:=private.relystra_diagnosis_access(p_company_id,d.id);
  select jsonb_build_object('total',count(*),'suggested',count(*) filter(where action_review_state='suggested'),
    'accepted',count(*) filter(where status in ('completed','approved','done','not_applicable')),
    'review',count(*) filter(where action_review_state='approved' and status='ready_for_review'),
    'client',count(*) filter(where action_review_state='approved' and responsible_party='client' and status not in ('completed','approved','done','not_applicable','ready_for_review')),
    'admin',count(*) filter(where action_review_state='approved' and responsible_party='admin' and status not in ('completed','approved','done','not_applicable','ready_for_review')),
    'ai_processing',count(*) filter(where action_review_state='approved' and responsible_party='ai' and status='in_progress'),
    'ai',count(*) filter(where status<>'in_progress' and action_review_state='approved' and responsible_party='ai' and status not in ('completed','approved','done','not_applicable','ready_for_review')))
    into actions from public.nexus_tasks where company_id=p_company_id and work_kind='prebuild_action' and archived_at is null and action_review_state not in ('rejected','postponed')
      and source_diagnosis_run_id=d.id;
  select jsonb_build_object('approved',jsonb_array_length(public.relystra_build_menu(p_company_id)),
    'proposed',(select count(*) from public.nexus_opportunities where company_id=p_company_id and build_review_state='proposed')) into builds;
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'status',status,'paid',paid_at is not null,'stage',package_stage,
    'diagnosis_context_id',coalesce(context_diagnosis_run_id,source_diagnosis_run_id)) order by activated_at desc nulls last,created_at desc),'[]')
    into projects from public.nexus_projects where company_id=p_company_id;
  select * into cfg from public.nexus_delivery_settings where singleton;
  return jsonb_build_object('company_id',p_company_id,'project_id',p.id,'project_type',p.project_type,'projects',projects,
    'diagnosis',jsonb_build_object('id',d.id,'status',d.status,'access',diagnosis_access,'project_id',d.project_id,
      'preparation_project_id',coalesce(nullif(d.analysis_packet#>>'{project,id}',''),d.project_id::text),
      'transcript_document_id',d.transcript_document_id,'supporting_document_ids',coalesce(to_jsonb(d.supporting_document_ids),'[]'::jsonb)),
    'actions',actions,'builds',builds,'payment_pending',exists(select 1 from public.nexus_build_plans where company_id=p_company_id and status='awaiting_payment'),
    'package',case when p.project_type='build_package' then public.relystra_package_progress(p.id) else null end,
    'offer',jsonb_build_object('price_cents',cfg.diagnosis_price_cents,'currency',cfg.currency,'checkout_enabled',cfg.checkout_enabled));
end $$;

revoke all on function private.relystra_create_build_plan(uuid,uuid[],text),private.relystra_activate_paid_plan(uuid),private.relystra_guard_paid_scope(),private.relystra_require_paid_package(),private.relystra_workspace_snapshot(uuid,uuid) from public,anon,authenticated;
grant execute on function private.relystra_create_build_plan(uuid,uuid[],text),private.relystra_workspace_snapshot(uuid,uuid) to authenticated;
commit;

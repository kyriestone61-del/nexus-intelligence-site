-- Build recommendations extend existing opportunities; paid delivery extends existing projects.
begin;
create table public.nexus_delivery_settings (
  singleton boolean primary key default true check(singleton),
  diagnosis_price_cents integer not null default 35000 check(diagnosis_price_cents>0),
  currency text not null default 'usd' check(currency ~ '^[a-z]{3}$'),
  simple_max integer not null default 7 check(simple_max between 5 and 13),
  standard_max integer not null default 11 check(standard_max>simple_max and standard_max<15),
  price_guidance jsonb not null default '{"simple":[150000,250000],"standard":[250000,500000],"advanced":[500000,1000000]}',
  duration_guidance jsonb not null default '{"simple":[1,3],"standard":[3,5],"advanced":[5,7]}',
  parallel_capacity integer not null default 1 check(parallel_capacity between 1 and 10),
  qa_days integer not null default 1 check(qa_days between 1 and 10),
  client_review_days integer not null default 2 check(client_review_days between 1 and 20),
  manual_payment_enabled boolean not null default false,
  checkout_enabled boolean not null default false,
  payment_livemode boolean not null default false,
  stripe_account_id text,
  updated_by uuid references auth.users(id),updated_at timestamptz not null default now()
);
insert into public.nexus_delivery_settings default values;
alter table public.nexus_delivery_settings enable row level security;
create policy relystra_admin_settings_read on public.nexus_delivery_settings for select to authenticated using(public.nexus_is_platform_admin());
create policy relystra_admin_settings_update on public.nexus_delivery_settings for update to authenticated
  using(public.nexus_is_platform_admin()) with check(public.nexus_is_platform_admin());
grant select,update on public.nexus_delivery_settings to authenticated;

alter table public.nexus_opportunities add column build_spec jsonb,
  add column build_review_state text check(build_review_state in ('proposed','approved','rejected','postponed')),
  add column build_approved_by uuid references auth.users(id),add column build_approved_at timestamptz;
create policy relystra_build_opportunity_private on public.nexus_opportunities as restrictive for select to authenticated
  using(build_spec is null or public.nexus_is_platform_admin());
-- Existing members can suggest legacy opportunities. New approved Build terms can only come from the review RPC.
create policy relystra_build_insert_boundary on public.nexus_opportunities as restrictive for insert to authenticated
  with check(build_spec is null and build_review_state is null);
create policy relystra_build_update_boundary on public.nexus_opportunities as restrictive for update to authenticated
  using(build_spec is null) with check(build_spec is null and build_review_state is null);
create policy relystra_build_retention on public.nexus_opportunities as restrictive for delete to authenticated using(build_spec is null);
create unique index nexus_build_opportunity_source on public.nexus_opportunities(source_diagnosis_run_id,(build_spec->>'source_path'),(build_spec->>'template_code')) where build_spec is not null;

create table public.nexus_build_plans (
  id uuid primary key default gen_random_uuid(),company_id uuid not null references public.nexus_companies(id),
  purchase_kind text not null check(purchase_kind in ('diagnosis','build_package')),
  name text not null,items jsonb not null check(jsonb_typeof(items)='array' and jsonb_array_length(items)>0),
  total_cents integer not null check(total_cents>0),currency text not null check(currency ~ '^[a-z]{3}$'),
  duration_min integer not null default 0 check(duration_min>=0),duration_max integer not null default 0 check(duration_max>=duration_min),
  duration_assumptions jsonb not null default '{}',
  snapshot_digest text not null,
  status text not null default 'awaiting_payment' check(status in ('awaiting_payment','paid','cancelled')),
  checkout_session_id text unique,checkout_url text,checkout_expires_at timestamptz,
  payment_reference text,payment_source text,paid_at timestamptz,
  created_by uuid not null references auth.users(id),created_at timestamptz not null default now()
);
alter table public.nexus_build_plans enable row level security;
create policy relystra_plan_read on public.nexus_build_plans for select to authenticated
  using(public.nexus_is_platform_admin() or public.nexus_is_company_member(company_id));
grant select on public.nexus_build_plans to authenticated;
create index nexus_build_plans_company on public.nexus_build_plans(company_id,created_at desc);

alter table public.nexus_projects add column build_plan_id uuid unique references public.nexus_build_plans(id),
  add column paid_at timestamptz,add column activated_at timestamptz,add column scope_snapshot jsonb,
  add column package_stage text check(package_stage in ('briefs','building','internal_qa','client_review','revisions','final_qa','support','completed')),
  add column support_starts_at timestamptz,add column support_ends_at timestamptz;
alter table public.nexus_projects add constraint nexus_paid_package_shape check(
  project_type<>'build_package' or (build_plan_id is not null and paid_at is not null and activated_at is not null and scope_snapshot is not null and package_stage is not null)
);
create policy relystra_project_insert_boundary on public.nexus_projects as restrictive for insert to authenticated with check(project_type is distinct from 'build_package');
create policy relystra_project_update_boundary on public.nexus_projects as restrictive for update to authenticated
  using(project_type is distinct from 'build_package') with check(project_type is distinct from 'build_package');
create policy relystra_project_retention on public.nexus_projects as restrictive for delete to authenticated using(project_type is distinct from 'build_package');
alter table public.nexus_system_cards add column opportunity_id uuid references public.nexus_opportunities(id),
  add column build_brief jsonb,add column brief_approved_by uuid references auth.users(id),add column brief_approved_at timestamptz,
  add column build_status text check(build_status in ('brief_draft','ready','building','qa','ready_for_review','revision','complete'));
create unique index nexus_package_build_once on public.nexus_system_cards(project_id,opportunity_id) where opportunity_id is not null;
create policy relystra_purchased_build_insert on public.nexus_system_cards as restrictive for insert to authenticated
  with check(opportunity_id is null and build_status is null and build_brief is null);
create policy relystra_purchased_build_update on public.nexus_system_cards as restrictive for update to authenticated
  using(opportunity_id is null) with check(opportunity_id is null and build_status is null and build_brief is null);
create policy relystra_purchased_build_retention on public.nexus_system_cards as restrictive for delete to authenticated using(opportunity_id is null);
alter table public.nexus_tasks add column build_id uuid references public.nexus_system_cards(id);
alter table public.nexus_tasks add constraint nexus_build_task_shape check(work_kind<>'build_task' or (project_id is not null and build_id is not null and assignee='nexus'));

create or replace function private.relystra_client_build(o public.nexus_opportunities)
returns jsonb language sql immutable set search_path='' as $$
  select jsonb_build_object('id',o.id,'name',o.title,'problem',o.problem,'outcome',o.build_spec->>'outcome',
    'scope_in',o.build_spec->'scope_in','scope_out',o.build_spec->'scope_out','inputs',o.build_spec->'required_inputs',
    'price_cents',(o.build_spec->>'price_cents')::integer,'currency',o.build_spec->>'currency',
    'duration_min',(o.build_spec->>'duration_min')::integer,'duration_max',(o.build_spec->>'duration_max')::integer,
    'dependencies',coalesce(o.build_spec->'dependencies','[]'),'assumptions',coalesce(o.build_spec->'assumptions','[]'),
    'acceptance_criteria',o.build_spec->'acceptance_criteria','template_code',o.build_spec->>'template_code',
    'diagnosis_run_id',o.source_diagnosis_run_id,'source_finding_refs',o.build_spec->'source_finding_refs',
    'completed_action_ids',o.build_spec->'completed_action_ids','approved_at',o.build_approved_at)
$$;

create or replace function private.relystra_save_build(p_company_id uuid,p_id uuid,p_spec jsonb,p_decision text)
returns uuid language plpgsql security definer set search_path='' as $$
declare o public.nexus_opportunities%rowtype; r public.nexus_diagnosis_runs%rowtype; cfg public.nexus_delivery_settings%rowtype;
  spec jsonb; finding jsonb; path text; total integer:=0; score jsonb; action_id text; tier text;
begin
  if auth.uid() is null or not public.nexus_is_platform_admin() then raise exception 'Relystra administrator access required'; end if;
  if p_decision not in ('propose','approve','reject','postpone') or jsonb_typeof(p_spec) is distinct from 'object' then raise exception 'Invalid build review'; end if;
  select * into cfg from public.nexus_delivery_settings where singleton;
  if p_id is not null then
    select * into o from public.nexus_opportunities where id=p_id and company_id=p_company_id for update;
    if o.id is null or o.build_spec is null then raise exception 'Build opportunity not found'; end if;
    if exists(select 1 from public.nexus_system_cards where opportunity_id=o.id) then raise exception 'Purchased scope is immutable. Create a separate follow-up build'; end if;
  end if;
  spec:=coalesce(o.build_spec,'{}')||p_spec;
  select * into r from public.nexus_diagnosis_runs where id=(spec->>'diagnosis_run_id')::uuid and company_id=p_company_id and status='approved';
  if r.id is null then raise exception 'An approved diagnosis for this client is required'; end if;
  if exists(select 1 from public.nexus_tasks where company_id=p_company_id and work_kind='prebuild_action' and archived_at is null
    and (action_review_state='suggested' or (action_review_state='approved' and status not in ('completed','approved','done','not_applicable')))) then
    raise exception 'Review suggested Actions and complete the required pre-build inputs first'; end if;
  path:=spec->>'source_path';
  if path is null or path !~ '^(opportunity_backlog|bottlenecks|root_causes|claims)/[0-9]+$' then raise exception 'A diagnosis finding reference is required'; end if;
  finding:=r.analysis_result#>string_to_array(path,'/');
  if finding is null then raise exception 'The referenced diagnosis finding does not exist'; end if;
  if not exists(select 1 from public.nexus_resolution_catalog where code=spec->>'template_code' and active and default_recipe->>'catalog_kind'='build_template') then
    raise exception 'Choose an available Build template'; end if;
  if jsonb_typeof(spec->'completed_action_ids') is distinct from 'array' then raise exception 'Completed input references are required'; end if;
  for action_id in select jsonb_array_elements_text(spec->'completed_action_ids') loop
    if not exists(select 1 from public.nexus_tasks where id=action_id::uuid and company_id=p_company_id and work_kind='prebuild_action'
      and archived_at is null and status in ('completed','approved','done')) then raise exception 'A completed input does not belong to this client'; end if;
  end loop;
  spec:=spec||jsonb_build_object('source_finding_refs',jsonb_build_array(jsonb_build_object('ref',r.id::text||':'||path||':'||md5(finding::text),
    'diagnosis_run_id',r.id,'path',path,'snapshot',finding,'analyzed_at',r.analysis_completed_at)));
  if nullif(btrim(spec->>'name'),'') is null or nullif(btrim(spec->>'outcome'),'') is null then raise exception 'A build needs a name and expected outcome'; end if;
  if p_decision='approve' then
    if jsonb_typeof(spec->'complexity_scores') is distinct from 'array' or jsonb_array_length(spec->'complexity_scores')<>5 then raise exception 'Score all five complexity dimensions'; end if;
    for score in select value from jsonb_array_elements(spec->'complexity_scores') loop
      if jsonb_typeof(score)<>'number' or score::text !~ '^[1-3]$' then raise exception 'Complexity scores must be 1, 2 or 3'; end if;
      total:=total+(score::text)::integer;
    end loop;
    tier:=case when total<=cfg.simple_max then 'simple' when total<=cfg.standard_max then 'standard' else 'advanced' end;
    if spec->>'complexity' not in ('simple','standard','advanced') or spec->>'complexity' is null then raise exception 'Confirm the final complexity tier'; end if;
    if coalesce((spec->>'price_cents')::integer,0)<=0 or spec->>'currency' is distinct from cfg.currency then raise exception 'Set the fixed price in the configured currency'; end if;
    if coalesce((spec->>'duration_min')::integer,0)<1 or coalesce((spec->>'duration_max')::integer,0)<(spec->>'duration_min')::integer then raise exception 'Confirm the build duration in business days'; end if;
    if jsonb_typeof(spec->'scope_in') is distinct from 'array' or jsonb_array_length(spec->'scope_in')=0 or
       jsonb_typeof(spec->'scope_out') is distinct from 'array' or jsonb_typeof(spec->'acceptance_criteria') is distinct from 'array' or jsonb_array_length(spec->'acceptance_criteria')=0 then raise exception 'Confirm included scope, exclusions and acceptance criteria'; end if;
    spec:=spec||jsonb_build_object('suggested_complexity',tier,'complexity_total',total);
  end if;
  if o.id is null then
    select * into o from public.nexus_opportunities where source_diagnosis_run_id=r.id and build_spec->>'source_path'=path and build_spec->>'template_code'=spec->>'template_code' for update;
    if o.id is not null then return o.id; end if;
    insert into public.nexus_opportunities(company_id,title,problem,source,status,recommendation,created_by,source_diagnosis_run_id,build_spec,build_review_state)
      values(p_company_id,spec->>'name',coalesce(spec->>'problem',finding->>'problem',finding->>'description'),'diagnosis','recommended',spec->>'outcome',auth.uid(),r.id,spec,'proposed') returning * into o;
  end if;
  update public.nexus_opportunities set title=spec->>'name',problem=coalesce(spec->>'problem',problem),recommendation=spec->>'outcome',build_spec=spec,
    build_review_state=case p_decision when 'approve' then 'approved' when 'reject' then 'rejected' when 'postpone' then 'postponed' else 'proposed' end,
    build_approved_by=case when p_decision='approve' then auth.uid() else null end,build_approved_at=case when p_decision='approve' then now() else null end,
    status=case when p_decision='approve' then 'approved' when p_decision='reject' then 'declined' else 'recommended' end,updated_at=now() where id=o.id;
  insert into public.nexus_activity_log(company_id,actor_id,action,entity_type,entity_id,summary)
    values(p_company_id,auth.uid(),'build_'||p_decision,'opportunity',o.id,'Build '||p_decision||': '||(spec->>'name'));
  return o.id;
end $$;
create or replace function public.relystra_save_build(p_company_id uuid,p_id uuid,p_spec jsonb,p_decision text default 'propose')
returns uuid language sql security invoker set search_path='' as $$ select private.relystra_save_build(p_company_id,p_id,p_spec,p_decision) $$;

create or replace function private.relystra_build_menu(p_company_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null or not (public.nexus_is_platform_admin() or public.nexus_is_company_member(p_company_id)) then raise exception 'Company access required'; end if;
  return coalesce((select jsonb_agg(private.relystra_client_build(o) order by o.build_approved_at,o.id) from public.nexus_opportunities o
    where o.company_id=p_company_id and o.build_review_state='approved' and not exists(select 1 from public.nexus_system_cards b where b.opportunity_id=o.id)),'[]');
end $$;
create or replace function public.relystra_build_menu(p_company_id uuid)
returns jsonb language sql stable security invoker set search_path='' as $$ select private.relystra_build_menu(p_company_id) $$;

create or replace function private.relystra_create_build_plan(p_company_id uuid,p_build_ids uuid[],p_name text)
returns uuid language plpgsql security definer set search_path='' as $$
declare o public.nexus_opportunities%rowtype; cfg public.nexus_delivery_settings%rowtype; items jsonb:='[]'; dep text;
  total bigint:=0; min_days integer; max_days integer; count_ids integer; plan_id uuid;
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
create or replace function public.relystra_create_build_plan(p_company_id uuid,p_build_ids uuid[],p_name text default null)
returns uuid language sql security invoker set search_path='' as $$ select private.relystra_create_build_plan(p_company_id,p_build_ids,p_name) $$;

revoke all on function private.relystra_client_build(public.nexus_opportunities) from public,anon,authenticated;
revoke all on function private.relystra_save_build(uuid,uuid,jsonb,text),public.relystra_save_build(uuid,uuid,jsonb,text),
  private.relystra_build_menu(uuid),public.relystra_build_menu(uuid),private.relystra_create_build_plan(uuid,uuid[],text),public.relystra_create_build_plan(uuid,uuid[],text) from public,anon;
grant execute on function private.relystra_save_build(uuid,uuid,jsonb,text),public.relystra_save_build(uuid,uuid,jsonb,text),
  private.relystra_build_menu(uuid),public.relystra_build_menu(uuid),private.relystra_create_build_plan(uuid,uuid[],text),public.relystra_create_build_plan(uuid,uuid[],text) to authenticated;
commit;

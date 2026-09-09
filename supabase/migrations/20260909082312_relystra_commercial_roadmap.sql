begin;

create or replace function private.relystra_qualification(p_spec jsonb)
returns jsonb language plpgsql immutable set search_path='' as $$
declare field text; assessment jsonb; score integer:=0; weight integer; level text;
begin
 foreach field in array array['impact','urgency','effort','dependency_readiness','client_readiness','confidence'] loop
  assessment:=p_spec#>array['qualification',field];level:=assessment->>'level';
  if level is null or level not in ('low','medium','high','unknown') or length(btrim(coalesce(assessment->>'reason','')))<5 then raise exception 'Evidence-backed % assessment required',field; end if;
  weight:=case field when 'impact' then 4 when 'urgency' then 3 when 'confidence' then 2 else 1 end;
  score:=score+weight*(case level when 'high' then 3 when 'medium' then 2 when 'low' then 1 else case when field='effort' then 3 else 0 end end)*(case field when 'effort' then -1 else 1 end);
 end loop;
 if nullif(btrim(p_spec->>'operational_benefit'),'') is null then raise exception 'Describe the operational benefit without invented ROI'; end if;
 return jsonb_build_object('score',score,'version','qualitative-v1');
end $$;

create or replace function private.relystra_client_build(o public.nexus_opportunities)
returns jsonb language sql stable set search_path='' as $$
select jsonb_build_object('id',o.id,'name',o.title,'problem',o.problem,'outcome',o.build_spec->>'outcome',
 'scope_in',o.build_spec->'scope_in','scope_out',o.build_spec->'scope_out','inputs',o.build_spec->'required_inputs',
 'price_cents',coalesce(o.build_spec->'price_cents',(select default_recipe->'default_price_cents' from public.nexus_resolution_catalog where code=o.build_spec->>'template_code')),'currency',coalesce(o.build_spec->>'currency',(select default_recipe->>'currency' from public.nexus_resolution_catalog where code=o.build_spec->>'template_code')),'duration_min',coalesce(o.build_spec->'duration_min',(select default_recipe#>'{typical_duration,min}' from public.nexus_resolution_catalog where code=o.build_spec->>'template_code')),'duration_max',coalesce(o.build_spec->'duration_max',(select default_recipe#>'{typical_duration,max}' from public.nexus_resolution_catalog where code=o.build_spec->>'template_code')),
 'dependencies',coalesce(o.build_spec->'dependencies','[]'),'dependency_reason',o.build_spec->>'dependency_reason',
 'assumptions',o.build_spec->'assumptions','acceptance_criteria',o.build_spec->'acceptance_criteria','template_code',o.build_spec->>'template_code',
 'diagnosis_run_id',o.source_diagnosis_run_id,'source_finding_refs',coalesce((select jsonb_agg(jsonb_build_object('ref',v->>'ref','diagnosis_run_id',v->>'diagnosis_run_id','path',v->>'path')) from jsonb_array_elements(coalesce(o.build_spec->'source_finding_refs','[]')) v),'[]'),
 'completed_action_ids',o.build_spec->'completed_action_ids','approved_at',o.build_approved_at,
 'why_recommended',o.build_spec->>'priority_reason','operational_benefit',o.build_spec->>'operational_benefit',
 'impact',o.build_spec#>>'{qualification,impact,level}','effort',o.build_spec#>>'{qualification,effort,level}',
 'offer_code',coalesce(o.build_spec->>'offer_code',(select default_recipe->>'default_offer' from public.nexus_resolution_catalog where code=o.build_spec->>'template_code'),'single_workflow'),
 'offer_name',(select name from public.nexus_commercial_offerings where code=coalesce(o.build_spec->>'offer_code',(select default_recipe->>'default_offer' from public.nexus_resolution_catalog where code=o.build_spec->>'template_code'),'single_workflow')),
 'commercial_state',coalesce(o.build_spec->>'commercial_state','commercially_ready'),
 'placement',coalesce(o.build_spec->>'placement','next'),'rank',coalesce((o.build_spec->>'rank_override')::integer,100000-coalesce((o.build_spec#>>'{ranking,score}')::integer,0)),
 'deposit_cents',coalesce((o.build_spec->>'deposit_cents')::integer,(o.build_spec->>'price_cents')::integer),
 'deliverables',coalesce(o.build_spec->'deliverables',o.build_spec->'scope_in'),
 'price_basis',case when coalesce(o.build_spec->>'commercial_state','commercially_ready')='commercially_ready' then 'Approved fixed scope' else 'Estimate; confirm scope before purchase' end)
$$;

create or replace function private.relystra_save_build(p_company_id uuid, p_id uuid, p_spec jsonb, p_decision text) returns uuid language plpgsql security definer set search_path='' as $$

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
  if p_decision='approve' and coalesce(spec->>'commercial_state','commercially_ready')='commercially_ready' then
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
  if p_decision='approve' and (o.id is null or spec ? 'commercial_state') and not (spec ? 'qualification') then raise exception 'Evidence-backed qualification is required before publishing a recommendation'; end if;
  if spec ? 'qualification' then spec:=spec||jsonb_build_object('ranking',private.relystra_qualification(spec)); end if;
  if coalesce(spec->>'commercial_state','commercially_ready') not in ('qualified','needs_discussion','commercially_ready') or coalesce(spec->>'placement','next') not in ('next','later') then raise exception 'Invalid roadmap decision'; end if;
  if spec->>'rank_override' is not null and (coalesce(spec->>'rank_override','') !~ '^[0-9]{1,5}$' or length(btrim(coalesce(spec->>'rank_override_reason','')))<10) then raise exception 'Record the judgment for a ranking override'; end if;
  if spec ? 'offer_code' then
    if not exists(select 1 from public.nexus_commercial_offerings f join public.nexus_resolution_catalog c on c.code=spec->>'template_code'
      where f.code=spec->>'offer_code' and f.active and c.default_recipe->'eligible_offers' ? f.code) then raise exception 'Choose an eligible Offer for this Build'; end if;
  end if;
  if p_decision='approve' and spec->>'commercial_state'='commercially_ready' then
    if exists(select 1 from jsonb_array_elements_text(coalesce(spec->'required_action_ids','[]')) required_id where not exists(select 1 from public.nexus_tasks t where t.company_id=p_company_id and t.id::text=required_id and t.action_review_state='approved' and t.status in ('completed','approved','done','not_applicable'))) then raise exception 'Accept the required inputs before offering this Build'; end if;
    if not exists(select 1 from public.nexus_resolution_catalog c where c.code=spec->>'template_code' and c.default_recipe->'eligible_offers' ? (spec->>'offer_code')) then raise exception 'Confirm an eligible commercial Offer'; end if;
    if exists(select 1 from public.nexus_resolution_catalog c where c.code=spec->>'template_code' and ((spec->>'price_cents')::integer<(c.default_recipe->>'min_price_cents')::integer or (spec->>'price_cents')::integer>(c.default_recipe->>'max_price_cents')::integer)) and length(btrim(coalesce(spec->>'price_override_reason','')))<10 then raise exception 'Record the reason for pricing outside Library guidance'; end if;
    if length(btrim(coalesce(spec->>'dependency_override_reason','')))<10 and exists(select 1 from public.nexus_resolution_catalog c cross join lateral jsonb_array_elements_text(coalesce(c.default_recipe->'prerequisite_builds','[]')) typical where c.code=spec->>'template_code' and not exists(select 1 from public.nexus_opportunities dependency where dependency.company_id=p_company_id and dependency.build_review_state='approved' and dependency.build_spec->>'template_code'=typical and coalesce(spec->'dependencies','[]') ? dependency.id::text)) then raise exception 'Resolve typical prerequisites or explain why they do not apply'; end if;
    if coalesce((spec->>'deposit_cents')::integer,(spec->>'price_cents')::integer)<1 or coalesce((spec->>'deposit_cents')::integer,0)>(spec->>'price_cents')::integer then raise exception 'Deposit must be positive and no greater than the approved price'; end if;
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
end 
$$;

create or replace function private.relystra_propose_builds(p_company_id uuid, p_run_id uuid, p_run_updated_at timestamp with time zone, p_input_versions jsonb, p_builds jsonb) returns uuid[] language plpgsql security definer set search_path='' as $$

declare actual jsonb; spec jsonb; ids uuid[]:='{}'; run public.nexus_diagnosis_runs%rowtype;
begin
  if auth.uid() is null or not public.nexus_is_platform_admin() then raise exception 'Relystra administrator access required'; end if;
  select * into run from public.nexus_diagnosis_runs where id=p_run_id and company_id=p_company_id and status='approved' for share;
  if run.id is null then raise exception 'Approved diagnosis required'; end if;
  if run.updated_at is distinct from p_run_updated_at then raise exception 'Diagnosis changed during generation. Review it and generate again'; end if;
  if jsonb_typeof(p_builds) is distinct from 'array' or jsonb_array_length(p_builds)>1000 then raise exception 'Recommendation batch exceeds the safe transaction size'; end if;
  perform 1 from public.nexus_tasks where company_id=p_company_id and work_kind='prebuild_action' order by id for share;
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'updated_at',updated_at) order by id),'[]') into actual
    from public.nexus_tasks where company_id=p_company_id and work_kind='prebuild_action' and archived_at is null
      and action_review_state='approved' and status in ('completed','approved','done');
  -- Compare the timestamp values, not their JSON formatting across PostgREST and PostgreSQL.
  if jsonb_typeof(p_input_versions) is distinct from 'array' or jsonb_array_length(p_input_versions)<>jsonb_array_length(actual)
    or exists(select 1 from jsonb_array_elements(actual) a where not exists(select 1 from jsonb_array_elements(p_input_versions) b
      where a->>'id'=b->>'id' and (a->>'updated_at')::timestamptz=(b->>'updated_at')::timestamptz)) then
    raise exception 'Accepted inputs changed during generation. Review them and generate again'; end if;
  for spec in select value from jsonb_array_elements(p_builds) loop
    if spec->>'qualified' is distinct from 'true' then continue; end if;
    perform private.relystra_qualification(spec);
    -- The caller cannot elevate model output to approved, attach a different diagnosis, or provide paid terms.
    spec:=(spec-array['price_cents','currency','duration_min','duration_max','complexity','build_approved_at','build_approved_by','deposit_cents','rank_override','commercial_state','offer_code'])
      ||jsonb_build_object('diagnosis_run_id',p_run_id,'generation_source','ai_recommendation','input_versions',actual,'commercial_state','qualified');
    ids:=array_append(ids,private.relystra_save_build(p_company_id,null,spec,'propose'));
  end loop;
  return ids;
end 
$$;

create or replace function private.relystra_guard_build_dependencies() returns trigger language plpgsql security definer set search_path='' as $$

declare dependency text;
begin
  if new.build_spec is null then return new; end if;
  if tg_op='UPDATE' and old.build_review_state='approved' and new.build_review_state<>'approved'
    and exists(select 1 from public.nexus_opportunities d where d.company_id=new.company_id and d.id<>new.id and d.build_review_state='approved'
      and coalesce(d.build_spec->'dependencies','[]') ? new.id::text) then
    raise exception 'Review the dependent Builds before withdrawing this prerequisite';
  end if;
  if new.build_review_state<>'approved' then return new; end if;
  if jsonb_typeof(coalesce(new.build_spec->'dependencies','[]'))<>'array' then raise exception 'Choose approved prerequisite Builds'; end if;
  for dependency in select jsonb_array_elements_text(coalesce(new.build_spec->'dependencies','[]')) loop
    if dependency=new.id::text or not exists(select 1 from public.nexus_opportunities d where d.id::text=dependency and d.company_id=new.company_id and d.build_review_state='approved') then
      raise exception 'Dependencies must be other approved Builds for this client';
    end if;
    if new.build_spec->>'commercial_state'='commercially_ready' and exists(select 1 from public.nexus_system_cards b where b.opportunity_id::text=dependency and b.company_id=new.company_id and b.build_status<>'complete') then
      raise exception 'A purchased prerequisite must finish before approving this dependent Build';
    end if;
  end loop;
  if exists(with recursive prerequisites(id,path) as (
    select value,array[new.id::text,value] from jsonb_array_elements_text(coalesce(new.build_spec->'dependencies','[]'))
    union all select next.value,p.path||next.value from prerequisites p join public.nexus_opportunities d on d.id::text=p.id and d.company_id=new.company_id
      cross join lateral jsonb_array_elements_text(coalesce(d.build_spec->'dependencies','[]')) next(value)
      where not p.id=any(p.path[1:array_length(p.path,1)-1])
  ) select 1 from prerequisites where id=new.id::text) then raise exception 'Build dependencies cannot form a cycle'; end if;
  return new;
end 
$$;

create or replace function private.relystra_create_build_plan(p_company_id uuid, p_build_ids uuid[], p_name text) returns uuid language plpgsql security definer set search_path='' as $$

declare o public.nexus_opportunities%rowtype; cfg public.nexus_delivery_settings%rowtype; items jsonb:='[]'; dep text;
  total bigint:=0; min_days integer; max_days integer; count_ids integer; plan_id uuid; source_run uuid;
begin
  if auth.uid() is null or not (public.nexus_is_platform_admin() or public.nexus_is_company_member(p_company_id)) then raise exception 'Company access required'; end if;
  select count(distinct id) into count_ids from unnest(p_build_ids) id;
  if count_ids=0 or count_ids<>cardinality(p_build_ids) or count_ids>1000 then raise exception 'Select distinct approved Builds within the transaction limit'; end if;
  select * into cfg from public.nexus_delivery_settings where singleton;
  -- Lock the selected opportunities in deterministic order so their approved terms cannot change mid-snapshot.
  for o in select * from public.nexus_opportunities where id=any(p_build_ids) order by id for update loop
    if o.company_id<>p_company_id or o.build_review_state is distinct from 'approved' or exists(select 1 from public.nexus_system_cards where opportunity_id=o.id) then raise exception 'Each selected Build must be approved and available for this client'; end if;
    if coalesce(o.build_spec->>'commercial_state','commercially_ready')<>'commercially_ready' then raise exception 'Confirm scope before purchasing this Build'; end if;
    if not exists(select 1 from public.nexus_resolution_catalog where code=o.build_spec->>'template_code' and active) then raise exception 'This Build is no longer available'; end if;
    if exists(select 1 from public.nexus_system_cards b join public.nexus_projects p on p.id=b.project_id where b.company_id=p_company_id
      and b.build_brief#>>'{scope,template_code}'=o.build_spec->>'template_code') and length(btrim(coalesce(o.build_spec->>'repeat_scope_reason','')))<10 then raise exception 'This Build is already included. A distinct follow-on scope requires administrator review'; end if;
    if exists(select 1 from jsonb_array_elements(items) i where i->>'template_code'=o.build_spec->>'template_code') and length(btrim(coalesce(o.build_spec->>'repeat_scope_reason','')))<10 then raise exception 'Each selected capability needs a distinct approved scope'; end if;
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
  select (schedule->>'min_days')::integer,(schedule->>'max_days')::integer into min_days,max_days from (select private.relystra_schedule(items,cfg.parallel_capacity,cfg.qa_days,cfg.client_review_days) schedule) calculated;
  insert into public.nexus_build_plans(company_id,purchase_kind,name,items,total_cents,currency,duration_min,duration_max,duration_assumptions,snapshot_digest,created_by,deposit_cents)
    values(p_company_id,'build_package',coalesce(nullif(btrim(p_name),''),'Build Package'),items,total::integer,cfg.currency,min_days,max_days,
      private.relystra_schedule(items,cfg.parallel_capacity,cfg.qa_days,cfg.client_review_days),
      md5(items::text||':'||total::text||':'||cfg.currency),auth.uid(),(select sum((i->>'deposit_cents')::integer)::integer from jsonb_array_elements(items) i)) returning id into plan_id;
  return plan_id;
end 
$$;


create or replace function private.relystra_build_menu(p_company_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not (public.nexus_is_platform_admin() or public.nexus_is_company_member(p_company_id)) then raise exception 'Company access required'; end if;
 return coalesce((select jsonb_agg(private.relystra_client_build(o) order by coalesce((o.build_spec->>'rank_override')::integer,100000-coalesce((o.build_spec#>>'{ranking,score}')::integer,0)),o.id)
 from public.nexus_opportunities o where o.company_id=p_company_id and o.build_review_state='approved' and o.source_diagnosis_run_id is not null
 and exists(select 1 from public.nexus_resolution_catalog where code=o.build_spec->>'template_code' and active)
 and not exists(select 1 from public.nexus_system_cards b where b.opportunity_id=o.id)
 and (length(btrim(coalesce(o.build_spec->>'repeat_scope_reason','')))>9 or not exists(select 1 from public.nexus_system_cards b where b.company_id=p_company_id and b.build_brief#>>'{scope,template_code}'=o.build_spec->>'template_code'))),'[]');
end $$;
create or replace function public.relystra_build_interest(p_company_id uuid,p_build_id uuid,p_intent text,p_note text default '')
returns void language plpgsql security definer set search_path='' as $$
declare o public.nexus_opportunities%rowtype;
begin
 if auth.uid() is null or not (public.nexus_is_platform_admin() or public.nexus_is_company_member(p_company_id)) then raise exception 'Company access required'; end if;
 select * into o from public.nexus_opportunities where id=p_build_id and company_id=p_company_id and build_review_state='approved' for update;
 if o.id is null or p_intent not in ('discuss','later') or length(p_note)>3000 then raise exception 'Invalid recommendation request'; end if;
 insert into public.nexus_activity_log(company_id,actor_id,action,entity_type,entity_id,summary)
 values(p_company_id,auth.uid(),'build_interest_'||p_intent,'opportunity',o.id,left(o.title||': '||p_note,3500));
 -- Interest is a request only; it never approves, selects scope or activates work.
 update public.nexus_opportunities set build_spec=build_spec||jsonb_build_object('client_interest',p_intent,'client_interest_note',p_note,'client_interest_at',now()),updated_at=now() where id=o.id;
end $$;
revoke all on function public.relystra_build_interest(uuid,uuid,text,text) from public,anon;
grant execute on function public.relystra_build_interest(uuid,uuid,text,text) to authenticated;
revoke all on function private.relystra_qualification(jsonb) from public,anon,authenticated;
commit;

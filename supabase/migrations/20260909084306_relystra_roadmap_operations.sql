begin;
create or replace function public.relystra_save_library_build(p_code text,p_title text,p_recipe jsonb,p_active boolean default true)
returns text language plpgsql security definer set search_path='' as $$
declare key text; ref text; recipe jsonb;
begin
 if auth.uid() is null or not public.nexus_is_platform_admin() then raise exception 'Administrator access required'; end if;
 if p_code !~ '^build_[a-z0-9_]{1,110}$' or length(btrim(p_title))<3 or length(p_title)>250 or jsonb_typeof(p_recipe) is distinct from 'object' or length(p_recipe::text)>60000 then raise exception 'Valid Build ID, title and metadata required'; end if;
 select default_recipe into recipe from public.nexus_resolution_catalog where code=p_code for update;
 recipe:=coalesce(recipe,'{}')||p_recipe||jsonb_build_object('catalog_kind','build_template','schema_version',3,'code',p_code,'title',p_title);
 foreach key in array array['industry','workflow_lane','client_description','typical_problem','typical_outcome','internal_description'] loop
  if length(btrim(coalesce(recipe->>key,'')))<2 then raise exception 'Confirm %',key; end if;
 end loop;
 foreach key in array array['required_inputs','deliverables','qualifying_conditions','eligible_offers','default_checklist','prerequisite_builds','compatible_parallel_builds','recommended_follow_on_builds'] loop
  if jsonb_typeof(recipe->key) is distinct from 'array' or exists(select 1 from jsonb_array_elements(recipe->key) v where jsonb_typeof(v)<>'string' or length(btrim(v#>>'{}'))<1) then raise exception 'Confirm % as a list',key; end if;
 end loop;
 foreach key in array array['default_price_cents','min_price_cents','max_price_cents'] loop
  if coalesce(recipe->>key,'') !~ '^[0-9]{1,8}$' or (recipe->>key)::integer<1 then raise exception 'Valid pricing guidance required'; end if;
 end loop;
 if (recipe->>'default_price_cents')::integer not between (recipe->>'min_price_cents')::integer and (recipe->>'max_price_cents')::integer then raise exception 'Default price must fall within Library guidance'; end if;
 if coalesce(recipe->>'currency','') !~ '^[a-z]{3}$' or recipe->>'complexity' not in ('simple','standard','advanced') or recipe->>'implementation_effort' not in ('low','medium','high') or coalesce(recipe#>>'{typical_duration,min}','') !~ '^[0-9]{1,3}$' or coalesce(recipe#>>'{typical_duration,max}','') !~ '^[0-9]{1,3}$' or (recipe#>>'{typical_duration,min}')::integer<1 or (recipe#>>'{typical_duration,max}')::integer<(recipe#>>'{typical_duration,min}')::integer then raise exception 'Confirm currency, complexity, effort and business-day duration'; end if;
 if jsonb_array_length(recipe->'required_inputs')<1 or jsonb_array_length(recipe->'deliverables')<1 or jsonb_array_length(recipe->'default_checklist') not between 1 and 25 then raise exception 'Confirm inputs, deliverables and one to 25 implementation tasks'; end if;
 if not (recipe->'eligible_offers' ? (recipe->>'default_offer')) then raise exception 'Default Offer must be eligible'; end if;
 for ref in select jsonb_array_elements_text(recipe->'eligible_offers') loop
  if not exists(select 1 from public.nexus_commercial_offerings where code=ref and active) then raise exception 'Unknown Offer'; end if;
 end loop;
 for ref in select jsonb_array_elements_text(recipe->'prerequisite_builds') loop
  if ref=p_code or not exists(select 1 from public.nexus_resolution_catalog where code=ref) then raise exception 'Prerequisite must be another Library Build'; end if;
 end loop;
 if exists(with recursive paths(code,path) as (
  select value,array[p_code,value] from jsonb_array_elements_text(recipe->'prerequisite_builds')
  union all select dep.value,p.path||dep.value from paths p join public.nexus_resolution_catalog c on c.code=p.code
   cross join lateral jsonb_array_elements_text(coalesce(c.default_recipe->'prerequisite_builds','[]')) dep(value) where not p.code=any(p.path[1:array_length(p.path,1)-1])
 ) select 1 from paths where code=p_code) then raise exception 'Library prerequisites cannot form a cycle'; end if;
 recipe:=recipe||jsonb_build_object('change_log',coalesce(recipe->'change_log','[]')||jsonb_build_array(jsonb_build_object('actor',auth.uid(),'at',now(),'title',p_title,'active',p_active)));
 insert into public.nexus_resolution_catalog(code,title,category,description,match_terms,default_recipe,version,active)
 values(p_code,p_title,recipe->>'workflow_lane',recipe->>'typical_problem','{}',recipe,3,p_active)
 on conflict(code) do update set title=excluded.title,category=excluded.category,description=excluded.description,default_recipe=excluded.default_recipe,active=excluded.active,version=public.nexus_resolution_catalog.version+1;

 return p_code;
end $$;
create or replace function private.relystra_schedule(p_items jsonb,p_capacity integer,p_qa integer,p_review integer)
returns jsonb language plpgsql immutable set search_path='' as $$
declare remaining jsonb:=p_items; scheduled jsonb:='[]'; item jsonb; selected_id text; lo_slots integer[]:=array_fill(0,array[p_capacity]); hi_slots integer[]:=array_fill(0,array[p_capacity]); lo integer; hi integer; lo_slot integer; hi_slot integer;
begin
 if p_capacity<1 or p_capacity>100 then raise exception 'Invalid delivery capacity'; end if;
 while jsonb_array_length(remaining)>0 loop
  select i into item from jsonb_array_elements(remaining) i where not exists(select 1 from jsonb_array_elements_text(coalesce(i->'dependencies','[]')) d where exists(select 1 from jsonb_array_elements(remaining) candidate where candidate->>'id'=d))
  order by coalesce((i->>'rank')::integer,100000),i->>'id' limit 1;
  if item is null then raise exception 'Build dependencies contain a cycle'; end if;
  selected_id:=item->>'id';
  select n into lo_slot from generate_subscripts(lo_slots,1) n order by lo_slots[n],n limit 1;
  select n into hi_slot from generate_subscripts(hi_slots,1) n order by hi_slots[n],n limit 1;
  select greatest(lo_slots[lo_slot],coalesce(max((s->>'finish_min')::integer),0)),greatest(hi_slots[hi_slot],coalesce(max((s->>'finish_max')::integer),0)) into lo,hi
   from jsonb_array_elements(scheduled) s where coalesce(item->'dependencies','[]') ? (s->>'id');
  lo_slots[lo_slot]:=lo+(item->>'duration_min')::integer;hi_slots[hi_slot]:=hi+(item->>'duration_max')::integer;
  scheduled:=scheduled||jsonb_build_array(jsonb_build_object('id',selected_id,'start_min',lo,'start_max',hi,'finish_min',lo_slots[lo_slot],'finish_max',hi_slots[hi_slot]));
  select coalesce(jsonb_agg(i),'[]') into remaining from jsonb_array_elements(remaining) i where i->>'id'<>selected_id;
 end loop;
 return jsonb_build_object('items',scheduled,'min_days',(select max(v) from unnest(lo_slots) v)+p_qa+p_review,'max_days',(select max(v) from unnest(hi_slots) v)+p_qa+p_review,'parallel_capacity',p_capacity,'unit','business_days','starts','after required inputs and brief approval; queue confirmed by Relystra');
end $$;
create or replace function public.relystra_roadmap(p_company_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare included jsonb; cfg public.nexus_delivery_settings%rowtype;
begin
 if auth.uid() is null or not (public.nexus_is_platform_admin() or public.nexus_is_company_member(p_company_id)) then raise exception 'Company access required'; end if;
 select * into cfg from public.nexus_delivery_settings where singleton;
 select coalesce(jsonb_agg(jsonb_build_object('id',b.id,'opportunity_id',b.opportunity_id,'project_id',p.id,'plan_id',p.build_plan_id,'name',b.name,'problem',b.build_brief#>>'{scope,problem}','outcome',b.build_brief#>>'{scope,outcome}',
  'scope_in',b.build_brief#>'{scope,scope_in}','inputs',b.build_brief#>'{scope,inputs}','price_cents',b.build_brief#>'{scope,price_cents}','currency',b.build_brief#>>'{scope,currency}','duration_min',b.build_brief#>'{scope,duration_min}','duration_max',b.build_brief#>'{scope,duration_max}',
  'status',case when b.build_status='ready' then 'queued' else b.build_status end,'stage',p.package_stage,'dependencies',b.build_brief#>'{scope,dependencies}',
  'next_milestone',case when b.build_status='brief_draft' then 'Confirm inputs and implementation brief' when b.build_status='ready' then 'Start when prerequisites and capacity are ready' when b.build_status='building' then 'Internal quality checks' when b.build_status='ready_for_review' then 'Client review and walkthrough' when b.build_status='complete' then 'Use the delivered system and maintenance guide' else 'Relystra review' end) order by p.activated_at,b.created_at,b.id),'[]') into included
 from public.nexus_system_cards b join public.nexus_projects p on p.id=b.project_id where b.company_id=p_company_id and p.company_id=p_company_id and p.project_type='build_package';
 return jsonb_build_object('included',included,'recommendations',private.relystra_build_menu(p_company_id),'payments',public.relystra_payment_summary(p_company_id),
 'parallel_capacity',cfg.parallel_capacity,'schedule_note','Estimates begin when required inputs and briefs are ready. Prerequisites and available delivery capacity determine the start; Relystra confirms your queue.');
end $$;
revoke all on function public.relystra_save_library_build(text,text,jsonb,boolean),public.relystra_roadmap(uuid) from public,anon;
grant execute on function public.relystra_save_library_build(text,text,jsonb,boolean),public.relystra_roadmap(uuid) to authenticated;
revoke all on function private.relystra_schedule(jsonb,integer,integer,integer) from public,anon,authenticated;

create or replace function private.relystra_workspace_snapshot(p_company_id uuid,p_project_id uuid default null) returns jsonb language plpgsql stable security definer set search_path='' as $$

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
  return jsonb_build_object('company_id',p_company_id,'project_id',p.id,'project_type',p.project_type,'initial_engagement',p.source_discovery_id is not null,'discovery_id',p.source_discovery_id,'projects',projects,
    'diagnosis',jsonb_build_object('id',d.id,'status',d.status,'access',diagnosis_access,'project_id',d.project_id,
      'preparation_project_id',coalesce(nullif(d.analysis_packet#>>'{project,id}',''),d.project_id::text),
      'transcript_document_id',d.transcript_document_id,'supporting_document_ids',coalesce(to_jsonb(d.supporting_document_ids),'[]'::jsonb)),
    'actions',actions,'builds',builds,'payment_pending',exists(select 1 from public.nexus_build_plans where company_id=p_company_id and status='awaiting_payment'),
    'package',case when p.project_type='build_package' then public.relystra_package_progress(p.id) else null end,
    'offer',jsonb_build_object('price_cents',cfg.diagnosis_price_cents,'currency',cfg.currency,'checkout_enabled',cfg.checkout_enabled));
end 
$$;

create or replace function public.relystra_offer_ladder() returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('code',code,'name',name,'min_price_cents',commercial_config->'min_price_cents','max_price_cents',commercial_config->'max_price_cents','currency',commercial_config->>'currency','billing_period',commercial_config->>'billing_period','includes_full_diagnosis',commercial_config->'includes_full_diagnosis','open_ended',code='advanced_system') order by sort_order),'[]') from public.nexus_commercial_offerings where active and commercial_config ? 'remote_first'
$$;
revoke all on function public.relystra_offer_ladder() from public; grant execute on function public.relystra_offer_ladder() to anon,authenticated;

create or replace function public.relystra_save_offer(p_code text,p_min integer,p_max integer,p_deposit_percent integer) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.nexus_is_platform_admin() then raise exception 'Administrator access required'; end if;
 if p_min is null or p_max is null or p_deposit_percent is null or p_min<0 or p_max<p_min or p_deposit_percent not between 0 and 100 or (p_code<>'free_discovery' and (p_min=0 or p_deposit_percent=0)) or (p_code='free_discovery' and (p_min<>0 or p_max<>0 or p_deposit_percent<>0)) then raise exception 'Valid Offer range and required payment percentage required'; end if;
 update public.nexus_commercial_offerings set commercial_config=commercial_config||jsonb_build_object('min_price_cents',p_min,'max_price_cents',p_max,'deposit_percent',p_deposit_percent,'updated_by',auth.uid(),'updated_at',now()),updated_at=now() where code=p_code and commercial_config ? 'remote_first';
 if not found then raise exception 'Offer not found'; end if;
end $$;
create or replace function public.relystra_save_local_addons(p_addons jsonb) returns void language plpgsql security definer set search_path='' as $$
declare item jsonb;
begin
 if auth.uid() is null or not public.nexus_is_platform_admin() then raise exception 'Administrator access required'; end if;
 if jsonb_typeof(p_addons) is distinct from 'array' or length(p_addons::text)>15000 then raise exception 'Use a concise list of optional local add-ons'; end if;
 for item in select value from jsonb_array_elements(p_addons) loop
  if length(btrim(coalesce(item->>'name','')))<3 or coalesce(item->>'price_cents','') !~ '^[0-9]{1,8}$' or (item->>'price_cents')::integer<1 or jsonb_typeof(item->'minutes') is distinct from 'array' or jsonb_array_length(item->'minutes')<>2 or (item#>>'{minutes,0}')::integer<0 or (item#>>'{minutes,1}')::integer<(item#>>'{minutes,0}')::integer then raise exception 'Each optional add-on needs a name, positive price and duration range'; end if;
 end loop;
 update public.nexus_delivery_settings set local_addons=p_addons,updated_by=auth.uid(),updated_at=now() where singleton;
end $$;
revoke all on function public.relystra_save_offer(text,integer,integer,integer),public.relystra_save_local_addons(jsonb) from public,anon;
grant execute on function public.relystra_save_offer(text,integer,integer,integer),public.relystra_save_local_addons(jsonb) to authenticated;
create or replace function private.relystra_save_delivery(p_build_id uuid,p_content jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare b public.nexus_system_cards%rowtype; p public.nexus_projects%rowtype; content jsonb:='{}'; key text; file_id text;
begin
  if auth.uid() is null or not public.nexus_is_platform_admin() then raise exception 'Relystra administrator access required'; end if;
  select * into b from public.nexus_system_cards where id=p_build_id;
  select * into p from public.nexus_projects where id=b.project_id and project_type='build_package' for update;
  select * into b from public.nexus_system_cards where id=p_build_id for update;
  if p.id is null or b.brief_approved_at is null or p.package_stage not in ('building','internal_qa','revisions') then raise exception 'Delivery edits require an approved Build in development or revision'; end if;
  if b.build_status='revision' and b.revision_resolution is null then raise exception 'Confirm whether the feedback is within scope before editing'; end if;
  if jsonb_typeof(p_content) is distinct from 'object' then raise exception 'Invalid delivery content'; end if;
  foreach key in array array['description','preview_url','what_to_test','tutorial','faq','walkthrough_url','supporting_files','known_limitations'] loop
    if p_content ? key then content:=content||jsonb_build_object(key,p_content->key); end if;
  end loop;
  content:=b.delivery_content||content;
  if content ? 'supporting_files' then
    if jsonb_typeof(content->'supporting_files') is distinct from 'array' then raise exception 'Choose shared workspace files'; end if;
    for file_id in select jsonb_array_elements_text(content->'supporting_files') loop
      if not exists(select 1 from public.nexus_documents d where d.id=file_id::uuid and d.company_id=b.company_id
        and (d.project_id is null or d.project_id=p.id) and d.document_area in ('nexus_shared','company_library') and d.status is distinct from 'archived') then
        raise exception 'Supporting files must be shared files for this client and package'; end if;
    end loop;
  end if;
  if content is not distinct from b.delivery_content then return b.id; end if;
  perform pg_advisory_xact_lock(72635901);
  if b.build_status not in ('building','revision') and (select count(*) from public.nexus_system_cards active join public.nexus_projects ap on ap.id=active.project_id where coalesce(ap.payment_livemode,true)=coalesce(p.payment_livemode,true) and active.build_status in ('building','qa','revision') and ap.project_type='build_package' and ap.package_stage not in ('support','completed')) >= (select parallel_capacity from public.nexus_delivery_settings where singleton) then raise exception 'Delivery capacity is occupied. Resume this Build when a slot is available'; end if;
  update public.nexus_system_cards set delivery_content=content,internal_qa=null,final_qa=null,client_review=null,build_status='building',updated_at=now() where id=b.id;
  update public.nexus_projects set package_stage=case when package_stage='internal_qa' then 'building' else package_stage end,updated_at=now() where id=p.id;
  return b.id;
end $$;

create or replace function private.relystra_save_brief(p_build_id uuid,p_patch jsonb,p_approve boolean)
returns uuid language plpgsql security definer set search_path='' as $$
declare b public.nexus_system_cards%rowtype; p public.nexus_projects%rowtype; o public.nexus_opportunities%rowtype;
  template public.nexus_resolution_catalog%rowtype; brief jsonb; paid_item jsonb; inputs jsonb; key text;
  checklist jsonb; item jsonb; step integer:=0; previous_task uuid; task_id uuid;
begin
  if auth.uid() is null or not public.nexus_is_platform_admin() then raise exception 'Relystra administrator access required'; end if;
  if jsonb_typeof(p_patch) is distinct from 'object' then raise exception 'Invalid Build Brief'; end if;
  select * into b from public.nexus_system_cards where id=p_build_id;
  select * into p from public.nexus_projects where id=b.project_id and company_id=b.company_id and project_type='build_package' for update;
  select * into b from public.nexus_system_cards where id=p_build_id for update;
  if p.id is null or p.paid_at is null then raise exception 'A paid Build Package is required'; end if;
  if p_approve and p.source_discovery_id is not null and not exists(select 1 from public.nexus_diagnosis_runs r where r.id=p.context_diagnosis_run_id and r.company_id=p.company_id and r.project_id=p.id and r.status='approved') then raise exception 'Approve the included Full Diagnosis before implementation'; end if;
  if p.package_stage not in ('briefs','building') then raise exception 'This package has already reached review or delivery'; end if;
  if b.brief_approved_at is not null then
    if p_approve and p_patch='{}' then return b.id; end if;
    raise exception 'The approved brief is retained. Use the package revision workflow for corrections';
  end if;
  select * into o from public.nexus_opportunities where id=b.opportunity_id and company_id=b.company_id;
  select i into paid_item from jsonb_array_elements(p.scope_snapshot->'items') i where i->>'id'=b.opportunity_id::text;
  if paid_item is null then raise exception 'Build does not belong to this paid scope'; end if;
  select * into template from public.nexus_resolution_catalog where code=paid_item->>'template_code' and default_recipe->>'catalog_kind'='build_template';
  if template.code is null then raise exception 'Purchased Build template is unavailable'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'title',t.title,'response',t.response_data,'accepted_at',t.reviewed_at,
    'source_finding_refs',t.source_finding_refs) order by t.id),'[]') into inputs from public.nexus_tasks t
    where t.company_id=b.company_id and t.work_kind='prebuild_action' and t.status in ('completed','approved','done')
      and t.id::text in (select jsonb_array_elements_text(coalesce(paid_item->'completed_action_ids','[]')));
  brief:=coalesce(b.build_brief,'{}');
  -- Only implementation clarification fields are editable. Paid scope, source references, price and duration are server-owned.
  foreach key in array array['tools_platforms','users_roles','automation_requirements','integrations','assumptions','risks','test_inputs','checklist'] loop
    if p_patch ? key then brief:=jsonb_set(brief,array[key],p_patch->key,true); end if;
  end loop;
  brief:=brief||jsonb_build_object('client_id',b.company_id,'project_id',p.id,'build_name',b.name,'category',template.category,
    'diagnosis_source',paid_item->'source_finding_refs','problem',paid_item->'problem','desired_outcome',paid_item->'outcome',
    'approved_scope',paid_item->'scope_in','exclusions',paid_item->'scope_out','required_inputs',paid_item->'inputs','supplied_inputs',inputs,
    'success_criteria',paid_item->'acceptance_criteria','price_cents',paid_item->'price_cents','currency',paid_item->'currency',
    'duration_min',paid_item->'duration_min','duration_max',paid_item->'duration_max','diagnosis_context_id',p.context_diagnosis_run_id,'scope_digest',p.scope_snapshot->>'snapshot_digest');
  checklist:=coalesce(brief->'checklist',template.default_recipe->'default_checklist');
  if p_approve then
    foreach key in array array['tools_platforms','users_roles','automation_requirements','integrations','assumptions','risks','test_inputs'] loop
      if jsonb_typeof(brief->key) is distinct from 'array' or jsonb_array_length(brief->key)=0
        or exists(select 1 from jsonb_array_elements(brief->key) v where jsonb_typeof(v)<>'string' or nullif(btrim(v#>>'{}'),'') is null) then
        raise exception 'Confirm % in the Build Brief, including an explicit none when appropriate',replace(key,'_',' '); end if;
    end loop;
    if jsonb_typeof(checklist) is distinct from 'array' or jsonb_array_length(checklist)<1 or jsonb_array_length(checklist)>25
      or exists(select 1 from jsonb_array_elements(checklist) v where jsonb_typeof(v)<>'string' or nullif(btrim(v#>>'{}'),'') is null) then
      raise exception 'Use one to 25 practical Build Tasks'; end if;
  end if;
  update public.nexus_system_cards set build_brief=brief||jsonb_build_object('checklist',checklist),
    brief_approved_by=case when p_approve then auth.uid() else null end,brief_approved_at=case when p_approve then now() else null end,
    build_status=case when p_approve then 'ready' else 'brief_draft' end,updated_at=now() where id=b.id;
  if p_approve then
    for item in select value from jsonb_array_elements(checklist) loop
      step:=step+1;
      insert into public.nexus_tasks(company_id,project_id,build_id,title,description,instructions,assignee,owner_scope,status,priority,
        work_kind,responsible_party,task_type,phase,notify_client,created_by,sort_order,dependency_task_id,source_diagnosis_run_id,source_finding_refs,workflow_metadata)
      values(b.company_id,p.id,b.id,item#>>'{}','Internal work for '||b.name,'Complete this task against the approved Build Brief and record the result.',
        'nexus','nexus','open','normal','build_task','admin','internal_build_task','implementation',false,auth.uid(),step,previous_task,
        coalesce((paid_item->>'diagnosis_run_id')::uuid,p.context_diagnosis_run_id),coalesce(paid_item->'source_finding_refs','[]'),jsonb_build_object('brief_version',jsonb_array_length(b.delivery_versions)+1)) returning id into task_id;
      previous_task:=task_id;
    end loop;
  end if;
  insert into public.nexus_activity_log(company_id,actor_id,action,entity_type,entity_id,summary)
    values(b.company_id,auth.uid(),case when p_approve then 'build_brief_approved' else 'build_brief_saved' end,'system_card',b.id,b.name);
  return b.id;
end $$;

commit;

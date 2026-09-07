begin;
alter table public.nexus_system_cards add column delivery_versions jsonb not null default '[]';
alter table public.nexus_opportunities add column build_versions jsonb not null default '[]';
-- Internal briefs live in existing system cards, while the client gets a deliberate progress projection.
create policy relystra_internal_build_details on public.nexus_system_cards as restrictive for select to authenticated
  using(opportunity_id is null or public.nexus_is_platform_admin());

create or replace function private.relystra_capture_build_version()
returns trigger language plpgsql security definer set search_path='' as $$
declare version jsonb;
begin
  if tg_table_name='nexus_opportunities' then
    if new.build_spec is null then return new; end if;
    if tg_op='UPDATE' and (new.build_spec,new.build_review_state) is not distinct from (old.build_spec,old.build_review_state) then return new; end if;
    version:=jsonb_build_object('actor_id',auth.uid(),'at',clock_timestamp(),'state',new.build_review_state,'snapshot',new.build_spec,
      'version',jsonb_array_length(case when tg_op='INSERT' then '[]'::jsonb else old.build_versions end)+1);
    new.build_versions:=(case when tg_op='INSERT' then '[]'::jsonb else old.build_versions end)||jsonb_build_array(version);
  elsif tg_table_name='nexus_system_cards' then
    if new.opportunity_id is null then return new; end if;
    if tg_op='UPDATE' and (to_jsonb(new)-array['delivery_versions','updated_at']) is not distinct from (to_jsonb(old)-array['delivery_versions','updated_at']) then return new; end if;
    version:=jsonb_build_object('actor_id',auth.uid(),'at',clock_timestamp(),'state',new.build_status,'snapshot',to_jsonb(new)-'delivery_versions',
      'version',jsonb_array_length(case when tg_op='INSERT' then '[]'::jsonb else old.delivery_versions end)+1);
    new.delivery_versions:=(case when tg_op='INSERT' then '[]'::jsonb else old.delivery_versions end)||jsonb_build_array(version);
  end if;
  return new;
end $$;
create trigger relystra_build_recommendation_version before insert or update on public.nexus_opportunities for each row execute function private.relystra_capture_build_version();
create trigger relystra_purchased_build_version before insert or update on public.nexus_system_cards for each row execute function private.relystra_capture_build_version();

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
    'duration_min',paid_item->'duration_min','duration_max',paid_item->'duration_max','scope_digest',p.scope_snapshot->>'snapshot_digest');
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
        (paid_item->>'diagnosis_run_id')::uuid,coalesce(paid_item->'source_finding_refs','[]'),jsonb_build_object('brief_version',jsonb_array_length(b.delivery_versions)+1)) returning id into task_id;
      previous_task:=task_id;
    end loop;
  end if;
  insert into public.nexus_activity_log(company_id,actor_id,action,entity_type,entity_id,summary)
    values(b.company_id,auth.uid(),case when p_approve then 'build_brief_approved' else 'build_brief_saved' end,'system_card',b.id,b.name);
  return b.id;
end $$;
create or replace function public.relystra_save_brief(p_build_id uuid,p_patch jsonb default '{}',p_approve boolean default false)
returns uuid language sql security invoker set search_path='' as $$ select private.relystra_save_brief(p_build_id,p_patch,p_approve) $$;

create or replace function private.relystra_set_build_task(p_task_id uuid,p_complete boolean,p_note text default null)
returns uuid language plpgsql security definer set search_path='' as $$
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
  update public.nexus_tasks set status=case when p_complete then 'completed' else 'open' end,
    completed_at=case when p_complete then now() else null end,review_note=p_note,updated_at=now(),notify_client=false where id=t.id;
  update public.nexus_system_cards set build_status='building',updated_at=now() where id=b.id;
  update public.nexus_projects set package_stage=case when package_stage='briefs' then 'building' else package_stage end,updated_at=now() where id=p.id;
  return t.id;
end $$;
create or replace function public.relystra_set_build_task(p_task_id uuid,p_complete boolean,p_note text default null)
returns uuid language sql security invoker set search_path='' as $$ select private.relystra_set_build_task(p_task_id,p_complete,p_note) $$;

create or replace function private.relystra_package_progress(p_project_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare p public.nexus_projects%rowtype; builds jsonb;
begin
  select * into p from public.nexus_projects where id=p_project_id and project_type='build_package';
  if auth.uid() is null or p.id is null or not (public.nexus_is_platform_admin() or public.nexus_is_company_member(p.company_id)) then raise exception 'Package access required'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',b.id,'name',b.name,'outcome',b.purpose,'status',b.build_status,
    'percent',case when b.build_status='complete' then 100 when counts.total=0 then 0 else least(90,floor(counts.done::numeric*90/counts.total)::integer) end)
    order by b.created_at,b.id),'[]') into builds from public.nexus_system_cards b
    cross join lateral (select count(*)::integer total,count(*) filter(where t.status in ('completed','approved','done'))::integer done
      from public.nexus_tasks t where t.build_id=b.id and t.work_kind='build_task' and t.archived_at is null) counts
    where b.project_id=p.id and b.opportunity_id is not null;
  return jsonb_build_object('project_id',p.id,'name',p.name,'stage',p.package_stage,'livemode',p.payment_livemode,'builds',builds,
    'percent',case when p.package_stage in ('support','completed') then 100 else coalesce((select floor(avg((i->>'percent')::numeric))::integer from jsonb_array_elements(builds) i),0) end,
    'support_starts_at',p.support_starts_at,'support_ends_at',p.support_ends_at);
end $$;
create or replace function public.relystra_package_progress(p_project_id uuid)
returns jsonb language sql stable security invoker set search_path='' as $$ select private.relystra_package_progress(p_project_id) $$;

revoke all on function private.relystra_capture_build_version() from public,anon,authenticated;
revoke all on function private.relystra_save_brief(uuid,jsonb,boolean),public.relystra_save_brief(uuid,jsonb,boolean),
  private.relystra_set_build_task(uuid,boolean,text),public.relystra_set_build_task(uuid,boolean,text),
  private.relystra_package_progress(uuid),public.relystra_package_progress(uuid) from public,anon;
grant execute on function private.relystra_save_brief(uuid,jsonb,boolean),public.relystra_save_brief(uuid,jsonb,boolean),
  private.relystra_set_build_task(uuid,boolean,text),public.relystra_set_build_task(uuid,boolean,text),
  private.relystra_package_progress(uuid),public.relystra_package_progress(uuid) to authenticated;

-- Preserve the existing event stream; new work records the reviewed object and file references, not every keystroke.
CREATE OR REPLACE FUNCTION private.nexus_task_actor_scope()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select case
    when auth.uid() is null then 'system'
    when public.nexus_is_platform_admin() then 'nexus'
    else 'client'
  end;
$function$
;
CREATE OR REPLACE FUNCTION private.nexus_capture_task_event()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_type text;
  v_detail jsonb := '{}'::jsonb;
begin

  if new.work_kind <> 'legacy' then
    if tg_op='UPDATE' and (new.status,new.action_review_state,new.responsible_party,new.title,new.instructions,new.form_schema,new.archived_at)
      is not distinct from (old.status,old.action_review_state,old.responsible_party,old.title,old.instructions,old.form_schema,old.archived_at) then return new; end if;
    insert into public.nexus_task_events(company_id,task_id,actor_id,actor_scope,event_type,from_status,to_status,detail)
    values(new.company_id,new.id,auth.uid(),private.nexus_task_actor_scope(),
      case when tg_op='INSERT' then 'assigned' when new.status='ready_for_review' then 'submitted'
        when new.status='needs_revision' then 'revision_requested' when new.status in ('completed','approved','done') then 'completed' else 'details_updated' end,
      case when tg_op='UPDATE' then old.status else null end,new.status,
      jsonb_build_object('delivery_version',1,'object_version',md5((to_jsonb(new)-'updated_at')::text),'snapshot',to_jsonb(new),
        'files',coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'file_name',d.file_name,'storage_path',d.storage_path,'created_at',d.created_at) order by d.created_at)
          from public.nexus_documents d where d.task_id=new.id and d.company_id=new.company_id),'[]')));
    return new;
  end if;
  if tg_op = 'INSERT' then
    insert into public.nexus_task_events(company_id,task_id,actor_id,actor_scope,event_type,to_status,detail)
    values(new.company_id,new.id,auth.uid(),private.nexus_task_actor_scope(),'assigned',new.status,
      jsonb_build_object('owner_scope',new.owner_scope,'assignee',new.assignee,'priority',new.priority,'due_date',new.due_date));
    return new;
  end if;

  if old.archived_at is distinct from new.archived_at and new.archived_at is not null then
    v_type := 'archived';
    v_detail := jsonb_build_object('archived_at',new.archived_at);
  elsif old.converted_to_project_id is distinct from new.converted_to_project_id and new.converted_to_project_id is not null then
    v_type := 'converted_to_project';
    v_detail := jsonb_build_object('project_id',new.converted_to_project_id);
  elsif old.help_requested_at is distinct from new.help_requested_at and new.help_requested_at is not null then
    v_type := 'help_requested';
    v_detail := jsonb_build_object('requested_at',new.help_requested_at);
  elsif old.status is distinct from new.status then
    v_type := case
      when new.status = 'ready_for_review' then 'submitted'
      when new.status = 'needs_revision' then 'revision_requested'
      when new.status in ('completed','approved','done') and old.status = 'ready_for_review' then 'approved'
      when new.status in ('completed','approved','done') then 'completed'
      when new.status = 'in_progress' then 'started'
      else 'status_changed'
    end;
    v_detail := jsonb_build_object('review_note',new.review_note);
  elsif old.assignee is distinct from new.assignee or old.owner_scope is distinct from new.owner_scope or old.owner_user_id is distinct from new.owner_user_id then
    v_type := 'reassigned';
    v_detail := jsonb_build_object('assignee',new.assignee,'owner_scope',new.owner_scope,'owner_user_id',new.owner_user_id);
  elsif old.priority is distinct from new.priority or old.due_date is distinct from new.due_date or old.required_evidence is distinct from new.required_evidence or old.completion_criteria is distinct from new.completion_criteria then
    v_type := 'details_updated';
    v_detail := jsonb_build_object('priority',new.priority,'due_date',new.due_date);
  else
    return new;
  end if;

  insert into public.nexus_task_events(company_id,task_id,actor_id,actor_scope,event_type,from_status,to_status,detail)
  values(new.company_id,new.id,auth.uid(),private.nexus_task_actor_scope(),v_type,old.status,new.status,v_detail);
  return new;
end
$function$
;

drop trigger if exists nexus_task_event_capture on public.nexus_tasks;
create trigger nexus_task_event_capture after insert or update on public.nexus_tasks for each row execute function private.nexus_capture_task_event();
create policy relystra_task_event_visible_task on public.nexus_task_events as restrictive for select to authenticated
  using(exists(select 1 from public.nexus_tasks t where t.id=nexus_task_events.task_id and t.company_id=nexus_task_events.company_id));
create policy relystra_task_event_read on public.nexus_task_events for select to authenticated
  using(public.nexus_is_platform_admin() or public.nexus_is_company_member(company_id));
create policy relystra_task_event_no_update on public.nexus_task_events as restrictive for update to authenticated using(false) with check(false);
create policy relystra_task_event_no_delete on public.nexus_task_events as restrictive for delete to authenticated using(false);
revoke all on function private.nexus_capture_task_event(),private.nexus_task_actor_scope() from public,anon,authenticated;

commit;

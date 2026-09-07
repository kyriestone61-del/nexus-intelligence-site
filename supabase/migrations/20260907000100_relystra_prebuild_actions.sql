-- Additive pre-purchase workflow. Existing tasks and approvals retain legacy semantics.
begin;

alter table public.nexus_tasks
  add column work_kind text not null default 'legacy' check (work_kind in ('legacy','prebuild_action','build_task')),
  add column responsible_party text check (responsible_party in ('client','admin','ai')),
  add column action_review_state text check (action_review_state in ('suggested','approved','rejected','postponed')),
  add column source_finding_refs jsonb not null default '[]'::jsonb check (jsonb_typeof(source_finding_refs)='array'),
  add column approved_by uuid references auth.users(id),
  add column approved_at timestamptz;

alter table public.nexus_tasks add constraint nexus_prebuild_action_shape check (
  work_kind<>'prebuild_action' or (project_id is null and responsible_party is not null and action_review_state is not null)
);
create unique index nexus_prebuild_source_once on public.nexus_tasks(source_diagnosis_run_id,resolution_step_key)
  where work_kind='prebuild_action' and source_diagnosis_run_id is not null;
create index nexus_tasks_work_kind_company on public.nexus_tasks(company_id,work_kind,status);

-- Restrictive policies combine with existing membership policies. Internal execution cannot
-- leak through the older policy that allowed members to read every non-draft task.
create policy relystra_task_visibility on public.nexus_tasks as restrictive for select to authenticated
  using (public.nexus_is_platform_admin() or work_kind='legacy' or
    (work_kind='prebuild_action' and action_review_state='approved' and responsible_party='client'));
create policy relystra_task_direct_update on public.nexus_tasks as restrictive for update to authenticated
  using (work_kind='legacy') with check (work_kind='legacy');
create policy relystra_task_direct_insert on public.nexus_tasks as restrictive for insert to authenticated
  with check (work_kind='legacy');
create policy relystra_action_file_insert on public.nexus_documents as restrictive for insert to authenticated
  with check (task_id is null or public.nexus_is_platform_admin() or exists (
    select 1 from public.nexus_tasks t where t.id=task_id and t.company_id=nexus_documents.company_id and
      (t.work_kind='legacy' or (t.work_kind='prebuild_action' and t.responsible_party='client' and
       t.action_review_state='approved' and t.archived_at is null and t.status in ('open','waiting_on_client','not_started','in_progress','needs_revision')))
  ));

drop trigger if exists nexus_task_notify_admins on public.nexus_tasks;
create trigger nexus_task_notify_admins after insert on public.nexus_tasks
  for each row when (new.work_kind='legacy') execute function private.nexus_notify_admins_on_task();
drop trigger if exists nexus_notify_admins_on_client_task_update on public.nexus_tasks;
create trigger nexus_notify_admins_on_client_task_update after update on public.nexus_tasks
  for each row when (new.work_kind='legacy') execute function private.nexus_notify_admins_on_client_task_update();

-- Preserve the old release and template engines for old records. New suggestions have one
-- contextual administrator approval and must not create another approval chain or email.
drop trigger if exists nexus_task_release_chain on public.nexus_tasks;
create trigger nexus_task_release_chain after insert or update of status on public.nexus_tasks
  for each row when (new.work_kind='legacy') execute function private.nexus_create_internal_release_chain();
drop trigger if exists nexus_apply_diagnosis_action_templates on public.nexus_diagnosis_runs;
create trigger nexus_apply_diagnosis_action_templates after update of status on public.nexus_diagnosis_runs
  for each row when (coalesce(new.orchestration_summary->>'delivery_version','1')<>'2')
  execute function private.nexus_apply_diagnosis_action_templates_trigger();

create or replace function private.relystra_validate_action_response(p_task public.nexus_tasks,p_response jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare field jsonb; requirement jsonb; value jsonb; key text;
begin
  if jsonb_typeof(p_response) is distinct from 'object' then raise exception 'A response object is required'; end if;
  if p_task.dependency_task_id is not null and not exists (
    select 1 from public.nexus_tasks d where d.id=p_task.dependency_task_id and d.company_id=p_task.company_id
      and d.archived_at is null and d.status in ('completed','approved','done','not_applicable')
  ) then raise exception 'Finish the previous action first'; end if;
  for field in select f.value from jsonb_array_elements(coalesce(p_task.form_schema,'[]')) f loop
    key:=field->>'key'; value:=p_response->key;
    if coalesce((field->>'required')::boolean,false) and
      (value is null or value='null'::jsonb or value='[]'::jsonb or value='{}'::jsonb or
       (jsonb_typeof(value)='string' and btrim(value#>>'{}')='')) then
      raise exception 'Complete the required field: %',coalesce(field->>'label',key);
    end if;
    if value is not null and value<>'null'::jsonb then
      if field->>'type' in ('text','textarea','select','date','email','url') and jsonb_typeof(value)<>'string' then
        raise exception 'Invalid response type for %',key;
      end if;
      if field->>'type'='select' and not coalesce(field->'options','[]'::jsonb) @> jsonb_build_array(value) then
        raise exception 'Choose an available option for %',key;
      end if;
      if field->>'type'='checkbox' and coalesce((field->>'required')::boolean,false) and value<>'true'::jsonb then
        raise exception 'Confirm the required field: %',coalesce(field->>'label',key);
      end if;
    end if;
  end loop;
  for requirement in select e.value from jsonb_array_elements(coalesce(p_task.required_evidence,'[]')) e loop
    if requirement->>'kind'='file' and coalesce((requirement->>'required')::boolean,false) and not exists (
      select 1 from public.nexus_documents d join storage.objects object
        on object.bucket_id='nexus-client-documents' and object.name=d.storage_path
      where d.task_id=p_task.id and d.company_id=p_task.company_id
        and d.status<>'archived' and d.storage_path is not null and d.size_bytes>0
    ) then raise exception 'Attach the required file to this action before submitting'; end if;
  end loop;
end $$;

create or replace function private.relystra_approve_diagnosis(p_run_id uuid,p_note text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.nexus_diagnosis_runs%rowtype; item record; t public.nexus_action_templates%rowtype;
  summary jsonb; n integer:=0; party text; source_key text; action jsonb;
begin
  if auth.uid() is null or not public.nexus_is_platform_admin() then raise exception 'Relystra administrator access required'; end if;
  select * into r from public.nexus_diagnosis_runs where id=p_run_id for update;
  if r.id is null then raise exception 'Diagnosis run not found'; end if;
  -- An earlier approval is historical evidence, never a reason to recreate its project or tasks.
  if r.status='approved' or r.orchestrated_at is not null then return coalesce(r.orchestration_summary,'{}'); end if;
  if r.status<>'ready_for_review' or jsonb_typeof(r.analysis_result) is distinct from 'object' or r.analysis_result='{}'::jsonb then
    raise exception 'Diagnosis must have an analysis result ready for review';
  end if;
  for item in
    select 'client_action_items' as collection,value,ordinality from jsonb_array_elements(coalesce(r.analysis_result->'client_action_items','[]')) with ordinality
    union all
    select 'nexus_actions',value,ordinality from jsonb_array_elements(coalesce(r.analysis_result->'nexus_actions','[]')) with ordinality
  loop
    action:=item.value;
    if nullif(btrim(action->>'title'),'') is null then continue; end if;
    source_key:=item.collection||'/'||(item.ordinality-1)::text;
    select * into t from public.nexus_action_templates where code=action->>'template_code'
      and workflow_metadata->>'work_kind'='prebuild_action' and active;
    party:=case when item.collection='client_action_items' then 'client' when action->>'responsible_party'='ai' or t.workflow_metadata->>'responsible_party'='ai' then 'ai' else 'admin' end;
    insert into public.nexus_tasks(company_id,project_id,title,description,instructions,assignee,owner_scope,status,priority,
      task_type,form_schema,required_evidence,completion_criteria,template_code,phase,notify_client,created_by,
      work_kind,responsible_party,action_review_state,source_diagnosis_run_id,resolution_step_key,source_finding_refs,workflow_metadata)
    values(r.company_id,null,btrim(action->>'title'),action->>'description',coalesce(nullif(action->>'instructions',''),t.instructions,action->>'description'),
      case when party='client' then 'client' else 'nexus' end,case when party='client' then 'client' else 'nexus' end,
      'draft',case when action->>'priority' in ('low','normal','high') then action->>'priority' else 'normal' end,
      coalesce(t.task_type,'structured_form'),coalesce(t.form_schema,'[{"key":"response","label":"Your response","type":"textarea","required":true}]'),
      coalesce(t.required_evidence,'[]'),coalesce(t.completion_criteria,'[]'),t.code,'prebuild',false,auth.uid(),
      'prebuild_action',party,'suggested',r.id,source_key,
      jsonb_build_array(jsonb_build_object('ref',r.id::text||':'||source_key||':'||md5(action::text),'diagnosis_run_id',r.id,
        'path',source_key,'analyzed_at',r.analysis_completed_at,'snapshot',action)),
      jsonb_build_object('delivery_version',2,'source','approved_diagnosis'))
    on conflict (source_diagnosis_run_id,resolution_step_key) where work_kind='prebuild_action' and source_diagnosis_run_id is not null do nothing;
    if found then n:=n+1; end if;
  end loop;
  summary:=jsonb_build_object('delivery_version',2,'projects',0,'suggested_actions',n,'plan_status','review_prebuild_actions');
  update public.nexus_diagnosis_runs set status='approved',approved_at=now(),approved_by=auth.uid(),
    review_notes=coalesce(nullif(btrim(p_note),''),review_notes),orchestrated_at=now(),orchestration_summary=summary,updated_at=now() where id=r.id;
  insert into public.nexus_activity_log(company_id,actor_id,action,entity_type,entity_id,summary)
    values(r.company_id,auth.uid(),'diagnosis_approved','diagnosis_run',r.id,'Diagnosis approved. Review the suggested pre-build actions.');
  return summary;
end $$;

create or replace function public.nexus_approve_diagnosis(p_run_id uuid,p_note text default null)
returns jsonb language sql security invoker set search_path='' as $$ select private.relystra_approve_diagnosis(p_run_id,p_note) $$;

create or replace function private.relystra_review_action(p_task_id uuid,p_decision text,p_patch jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare t public.nexus_tasks%rowtype; party text; next_status text;
begin
  if auth.uid() is null or not public.nexus_is_platform_admin() then raise exception 'Relystra administrator access required'; end if;
  if p_decision not in ('edit','approve','reject','postpone') or jsonb_typeof(p_patch) is distinct from 'object' then raise exception 'Invalid action review'; end if;
  select * into t from public.nexus_tasks where id=p_task_id for update;
  if t.id is null or t.work_kind<>'prebuild_action' or t.archived_at is not null then raise exception 'Pre-build action not found'; end if;
  if t.status in ('ready_for_review','completed','approved','done') then raise exception 'Submitted or completed actions retain their approved scope'; end if;
  party:=coalesce(p_patch->>'responsible_party',t.responsible_party);
  if party not in ('client','admin','ai') then raise exception 'Choose Client, Admin, or AI'; end if;
  if nullif(btrim(coalesce(p_patch->>'title',t.title)),'') is null or nullif(btrim(coalesce(p_patch->>'instructions',t.instructions)),'') is null then
    raise exception 'An action needs a title and clear instructions'; end if;
  if p_decision='approve' and t.action_review_state='approved' and p_patch='{}'::jsonb then return t.id; end if;
  next_status:=case when p_decision='approve' or (p_decision='edit' and t.action_review_state='approved')
    then case when party='client' then 'waiting_on_client' else 'open' end else 'draft' end;
  update public.nexus_tasks set title=coalesce(p_patch->>'title',title),description=coalesce(p_patch->>'description',description),
    instructions=coalesce(p_patch->>'instructions',instructions),responsible_party=party,
    assignee=case when party='client' then 'client' else 'nexus' end,owner_scope=case when party='client' then 'client' else 'nexus' end,
    due_date=case when p_patch?'due_date' then nullif(p_patch->>'due_date','')::date else due_date end,
    action_review_state=case p_decision when 'approve' then 'approved' when 'reject' then 'rejected' when 'postpone' then 'postponed' else action_review_state end,
    status=next_status,notify_client=(next_status='waiting_on_client'),
    approved_by=case when p_decision='approve' then auth.uid() else approved_by end,
    approved_at=case when p_decision='approve' then now() else approved_at end,updated_at=now()
  where id=t.id;
  insert into public.nexus_activity_log(company_id,actor_id,action,entity_type,entity_id,summary)
    values(t.company_id,auth.uid(),'prebuild_action_'||p_decision,'task',t.id,'Action '||p_decision||': '||coalesce(p_patch->>'title',t.title));
  return t.id;
end $$;

create or replace function public.relystra_review_action(p_task_id uuid,p_decision text,p_patch jsonb default '{}')
returns uuid language sql security invoker set search_path='' as $$ select private.relystra_review_action(p_task_id,p_decision,p_patch) $$;

create or replace function private.relystra_save_action_response(p_task_id uuid,p_response jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare t public.nexus_tasks%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into t from public.nexus_tasks where id=p_task_id for update;
  if t.id is null or t.work_kind<>'prebuild_action' then raise exception 'Pre-build action not found'; end if;
  if not public.nexus_is_company_member(t.company_id) or t.responsible_party<>'client' or t.assignee<>'client' then raise exception 'This action belongs to another actor'; end if;
  if t.action_review_state<>'approved' or t.archived_at is not null or not t.notify_client or
     t.status not in ('open','waiting_on_client','not_started','in_progress','needs_revision') then raise exception 'This action is not editable'; end if;
  if jsonb_typeof(p_response) is distinct from 'object' then raise exception 'A response object is required'; end if;
  update public.nexus_tasks set response_data=p_response,response_updated_at=now(),status='in_progress',updated_at=now() where id=t.id;
  return t.id;
end $$;
create or replace function public.relystra_save_action_response(p_task_id uuid,p_response jsonb)
returns uuid language sql security invoker set search_path='' as $$ select private.relystra_save_action_response(p_task_id,p_response) $$;

create or replace function private.relystra_submit_internal_action(p_task_id uuid,p_response jsonb,p_expected_at timestamptz default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare t public.nexus_tasks%rowtype;
begin
  if auth.uid() is null or not public.nexus_is_platform_admin() then raise exception 'Relystra administrator access required'; end if;
  select * into t from public.nexus_tasks where id=p_task_id for update;
  if t.id is null or t.work_kind<>'prebuild_action' or t.responsible_party not in ('admin','ai') then raise exception 'Internal pre-build action not found'; end if;
  if t.action_review_state<>'approved' or t.archived_at is not null or t.status not in ('open','in_progress','needs_revision') then raise exception 'This action is not ready for work'; end if;
  if p_expected_at is not null and t.updated_at is distinct from p_expected_at then raise exception 'The action changed while work was being prepared. Review it before submitting'; end if;
  perform private.relystra_validate_action_response(t,p_response);
  update public.nexus_tasks set response_data=p_response,response_updated_at=now(),status='ready_for_review',
    submitted_at=now(),review_note=null,updated_at=now() where id=t.id;
  return t.id;
end $$;
create or replace function public.relystra_submit_internal_action(p_task_id uuid,p_response jsonb,p_expected_at timestamptz default null)
returns uuid language sql security invoker set search_path='' as $$ select private.relystra_submit_internal_action(p_task_id,p_response,p_expected_at) $$;

-- Validate every submission of a new action, including legacy RPC entry points. Readiness
-- checks live in the database so an older client cannot bypass required fields or attachments.
create or replace function private.relystra_guard_action_submission()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.work_kind='prebuild_action' and new.status in ('completed','approved','done') and old.status is distinct from new.status then
    if old.status<>'ready_for_review' then raise exception 'Submit this action for review before completing it'; end if;
    perform private.relystra_validate_action_response(new,coalesce(new.response_data,'{}'));
  end if;
  if new.work_kind='prebuild_action' and new.status='ready_for_review' and old.status is distinct from new.status then
    if old.action_review_state<>'approved' or old.archived_at is not null then raise exception 'Approve this action before submission'; end if;
    perform private.relystra_validate_action_response(new,coalesce(new.response_data,'{}'));
  end if;
  return new;
end $$;
create trigger relystra_guard_action_submission before update of status on public.nexus_tasks
  for each row execute function private.relystra_guard_action_submission();

CREATE OR REPLACE FUNCTION public.nexus_approve_task(p_task_id uuid, p_note text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v public.nexus_tasks%rowtype;
  m record;
begin
  if not public.nexus_is_platform_admin() then raise exception 'Relystra administrator access required'; end if;
  select * into v from public.nexus_tasks where id=p_task_id for update;
  if v.id is null then raise exception 'Task not found'; end if;
  if v.archived_at is not null then raise exception 'Archived actions cannot be approved'; end if;
  if v.status <> 'ready_for_review' then raise exception 'Task is not ready for review'; end if;

  update public.nexus_tasks
  set status='completed',assignee='nexus',owner_scope='nexus',review_note=nullif(trim(coalesce(p_note,'')),''),reviewed_at=now(),completed_at=now(),updated_at=now()
  where id=p_task_id;

  for m in select user_id from public.nexus_company_members where company_id=v.company_id and active is true and (v.work_kind='legacy' or v.responsible_party='client') loop
    insert into public.nexus_notifications(company_id,user_id,notification_type,title,message,related_type,related_id,created_by,action_url)
    values(v.company_id,m.user_id,'task_approved','Step approved: '||v.title,'Relystra reviewed and completed this step.','task',v.id,auth.uid(),'/portal');
  end loop;

  insert into public.nexus_activity_log(company_id,actor_id,action,entity_type,entity_id,summary)
  values(v.company_id,auth.uid(),'task_approved','task',v.id,'Relystra approved step: '||v.title);
  return v.id;
end
$function$;

CREATE OR REPLACE FUNCTION public.nexus_request_task_revision(p_task_id uuid, p_note text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v public.nexus_tasks%rowtype;
  m record;
begin
  if not public.nexus_is_platform_admin() then raise exception 'Nexus administrator access required'; end if;
  select * into v from public.nexus_tasks where id=p_task_id for update;
  if v.id is null then raise exception 'Task not found'; end if;
  if v.archived_at is not null then raise exception 'Archived actions cannot be revised'; end if;
  if v.status <> 'ready_for_review' then raise exception 'Task is not ready for review'; end if;
  if nullif(trim(p_note),'') is null then raise exception 'Revision note is required'; end if;

  update public.nexus_tasks
  set status='needs_revision',assignee=case when v.work_kind='prebuild_action' and v.responsible_party in ('admin','ai') then 'nexus' else 'client' end,owner_scope=case when v.work_kind='prebuild_action' and v.responsible_party in ('admin','ai') then 'nexus' else 'client' end,review_note=trim(p_note),reviewed_at=now(),updated_at=now(),notify_client=(v.work_kind='legacy' or v.responsible_party='client')
  where id=p_task_id;

  for m in select user_id from public.nexus_company_members where company_id=v.company_id and active is true and (v.work_kind='legacy' or v.responsible_party='client') loop
    insert into public.nexus_notifications(company_id,user_id,notification_type,title,message,related_type,related_id,created_by,action_url)
    values(v.company_id,m.user_id,'task_revision','Changes requested: '||v.title,trim(p_note),'task',v.id,auth.uid(),'/portal');
  end loop;

  insert into public.nexus_activity_log(company_id,actor_id,action,entity_type,entity_id,summary)
  values(v.company_id,auth.uid(),'task_revision_requested','task',v.id,'Revision requested: '||v.title);
  return v.id;
end
$function$;

revoke all on function private.relystra_validate_action_response(public.nexus_tasks,jsonb) from public,anon,authenticated;
revoke all on function private.relystra_guard_action_submission() from public,anon,authenticated;
revoke all on function private.relystra_approve_diagnosis(uuid,text) from public,anon;
revoke all on function private.relystra_review_action(uuid,text,jsonb) from public,anon;
revoke all on function public.nexus_approve_diagnosis(uuid,text) from public,anon;
revoke all on function public.relystra_review_action(uuid,text,jsonb) from public,anon;
revoke all on function private.relystra_save_action_response(uuid,jsonb) from public,anon;
revoke all on function public.relystra_save_action_response(uuid,jsonb) from public,anon;
revoke all on function private.relystra_submit_internal_action(uuid,jsonb,timestamptz) from public,anon;
revoke all on function public.relystra_submit_internal_action(uuid,jsonb,timestamptz) from public,anon;
grant usage on schema private to authenticated;
grant execute on function private.relystra_approve_diagnosis(uuid,text),private.relystra_review_action(uuid,text,jsonb),
  public.nexus_approve_diagnosis(uuid,text),public.relystra_review_action(uuid,text,jsonb),
  private.relystra_save_action_response(uuid,jsonb),public.relystra_save_action_response(uuid,jsonb),
  private.relystra_submit_internal_action(uuid,jsonb,timestamptz),public.relystra_submit_internal_action(uuid,jsonb,timestamptz) to authenticated;
commit;

-- Production function snapshots from audited baseline 7cf1b68; no data or credentials.

CREATE OR REPLACE FUNCTION public.nexus_submit_task_for_review(p_task_id uuid, p_response_data jsonb DEFAULT NULL::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v public.nexus_tasks%rowtype;
  a record;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v from public.nexus_tasks where id=p_task_id for update;
  if v.id is null then raise exception 'Task not found'; end if;
  if v.archived_at is not null then raise exception 'Archived actions cannot be submitted'; end if;
  if not public.nexus_is_company_member(v.company_id) then raise exception 'Company membership required'; end if;
  if v.assignee <> 'client' then raise exception 'This step is not assigned to the client'; end if;
  if not v.notify_client then raise exception 'This step is not ready yet'; end if;
  if v.status not in ('waiting_on_client','not_started','open','in_progress','needs_revision') then raise exception 'This step is not currently actionable'; end if;
  if v.dependency_task_id is not null and not exists(
    select 1 from public.nexus_tasks d where d.id=v.dependency_task_id and d.status in ('approved','completed','done','not_applicable') and d.archived_at is null
  ) then raise exception 'Finish the previous step first'; end if;

  update public.nexus_tasks
  set response_data=coalesce(p_response_data,response_data),response_updated_at=case when p_response_data is null then response_updated_at else now() end,
      status='ready_for_review',assignee='nexus',owner_scope='nexus',submitted_at=now(),review_note=null,
      workflow_metadata=coalesce(workflow_metadata,'{}'::jsonb)-'help_requested',updated_at=now()
  where id=p_task_id;

  for a in select user_id from public.nexus_platform_admins loop
    insert into public.nexus_notifications(company_id,user_id,notification_type,title,message,related_type,related_id,created_by,action_url)
    values(v.company_id,a.user_id,'task_review','Step ready for review: '||v.title,'A client step was submitted and is ready for Relystra review.','task',v.id,auth.uid(),'/portal');
  end loop;

  insert into public.nexus_activity_log(company_id,actor_id,action,entity_type,entity_id,summary)
  values(v.company_id,auth.uid(),'task_submitted','task',v.id,'Client submitted step for Relystra review: '||v.title);
  return v.id;
end
$function$;

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

  for m in select user_id from public.nexus_company_members where company_id=v.company_id and active is true loop
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
  set status='needs_revision',assignee='client',owner_scope='client',review_note=trim(p_note),reviewed_at=now(),updated_at=now(),notify_client=true
  where id=p_task_id;

  for m in select user_id from public.nexus_company_members where company_id=v.company_id and active is true loop
    insert into public.nexus_notifications(company_id,user_id,notification_type,title,message,related_type,related_id,created_by,action_url)
    values(v.company_id,m.user_id,'task_revision','Changes requested: '||v.title,trim(p_note),'task',v.id,auth.uid(),'/portal');
  end loop;

  insert into public.nexus_activity_log(company_id,actor_id,action,entity_type,entity_id,summary)
  values(v.company_id,auth.uid(),'task_revision_requested','task',v.id,'Revision requested: '||v.title);
  return v.id;
end
$function$;

CREATE OR REPLACE FUNCTION public.nexus_is_company_member(p_company_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
 select exists(select 1 from public.nexus_company_members m where m.company_id=p_company_id and m.user_id=auth.uid() and m.active is true);
$function$;

CREATE OR REPLACE FUNCTION private.nexus_enforce_task_update_boundary()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_context text := coalesce(current_setting('nexus.workflow_context', true),'');
begin
  if auth.uid() is null then return new; end if;
  if public.nexus_is_platform_admin() then return new; end if;

  if old.assignee <> 'client' or not public.nexus_is_company_member(old.company_id) then
    raise exception 'Only Nexus can modify this action item';
  end if;

  -- Governed client help RPC: the RPC sets a transaction-local context and may
  -- change only the help metadata plus updated_at. Direct Data API updates never
  -- receive this context and remain restricted below.
  if v_context='help_request' then
    if (to_jsonb(new) - array['help_requested_at','help_requested_by','workflow_metadata','updated_at'])
       is distinct from
       (to_jsonb(old) - array['help_requested_at','help_requested_by','workflow_metadata','updated_at']) then
      raise exception 'Invalid governed help-request update';
    end if;
    return new;
  end if;

  -- Governed submission handoff. The secured RPC moves ownership to Nexus and
  -- may clear transient help metadata while preserving all other protected fields.
  if new.assignee = 'nexus' and new.owner_scope='nexus' and new.status = 'ready_for_review' then
    if (to_jsonb(new) - array['status','assignee','owner_scope','response_data','response_updated_at','submitted_at','review_note','workflow_metadata','updated_at'])
       is distinct from
       (to_jsonb(old) - array['status','assignee','owner_scope','response_data','response_updated_at','submitted_at','review_note','workflow_metadata','updated_at']) then
      raise exception 'Invalid client review handoff';
    end if;
    new.response_data := coalesce(new.response_data,'{}'::jsonb);
    return new;
  end if;

  if (to_jsonb(new) - array['status','response_data','response_updated_at','updated_at'])
     is distinct from
     (to_jsonb(old) - array['status','response_data','response_updated_at','updated_at']) then
    raise exception 'Clients may only update their action status and response';
  end if;

  if new.status not in ('open','waiting_on_client','in_progress','blocked','done','needs_revision') then
    raise exception 'Invalid client task status';
  end if;

  new.response_data := coalesce(new.response_data,'{}'::jsonb);
  return new;
end
$function$;

CREATE OR REPLACE FUNCTION private.nexus_guard_client_task_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if current_user <> 'authenticated' or public.nexus_is_platform_admin() then return new; end if;
  if auth.uid() is null or not public.nexus_is_company_member(old.company_id) then raise exception 'Company membership required'; end if;
  if old.assignee <> 'client' or old.status = 'draft' or old.archived_at is not null then raise exception 'This action is not directly editable by the client'; end if;

  if new.id is distinct from old.id
     or new.company_id is distinct from old.company_id
     or new.project_id is distinct from old.project_id
     or new.title is distinct from old.title
     or new.description is distinct from old.description
     or new.assignee is distinct from old.assignee
     or new.owner_scope is distinct from old.owner_scope
     or new.owner_user_id is distinct from old.owner_user_id
     or new.priority is distinct from old.priority
     or new.due_date is distinct from old.due_date
     or new.created_by is distinct from old.created_by
     or new.notify_client is distinct from old.notify_client
     or new.task_type is distinct from old.task_type
     or new.instructions is distinct from old.instructions
     or new.form_schema is distinct from old.form_schema
     or new.template_code is distinct from old.template_code
     or new.phase is distinct from old.phase
     or new.package_code is distinct from old.package_code
     or new.dependency_task_id is distinct from old.dependency_task_id
     or new.review_note is distinct from old.review_note
     or new.submitted_at is distinct from old.submitted_at
     or new.reviewed_at is distinct from old.reviewed_at
     or new.completed_at is distinct from old.completed_at
     or new.sort_order is distinct from old.sort_order
     or new.source_diagnosis_run_id is distinct from old.source_diagnosis_run_id
     or new.source_gap_analysis_id is distinct from old.source_gap_analysis_id
     or new.source_resolution_proposal_id is distinct from old.source_resolution_proposal_id
     or new.resolution_step_key is distinct from old.resolution_step_key
     or new.required_evidence is distinct from old.required_evidence
     or new.completion_criteria is distinct from old.completion_criteria
     or new.workflow_metadata is distinct from old.workflow_metadata
     or new.help_requested_at is distinct from old.help_requested_at
     or new.help_requested_by is distinct from old.help_requested_by
     or new.archived_at is distinct from old.archived_at
     or new.archived_by is distinct from old.archived_by
     or new.converted_to_project_id is distinct from old.converted_to_project_id
     or new.converted_to_project_at is distinct from old.converted_to_project_at
     or new.converted_to_project_by is distinct from old.converted_to_project_by
  then raise exception 'Protected action fields must be changed through a governed Nexus workflow'; end if;

  if new.status is distinct from old.status and new.status <> 'in_progress' then
    raise exception 'Client status transitions must use the governed Nexus workflow';
  end if;
  return new;
end
$function$;

CREATE OR REPLACE FUNCTION private.nexus_enforce_task_dependency_order()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_dep_status text;
begin
  if new.status is not distinct from old.status then return new; end if;
  if new.dependency_task_id is null then return new; end if;
  if lower(coalesce(new.status,'')) not in ('in_progress','ready_for_review','submitted','completed','approved','done') then return new; end if;
  select lower(coalesce(status,'')) into v_dep_status from public.nexus_tasks where id=new.dependency_task_id;
  if v_dep_status is null then raise exception 'The previous workflow step is missing'; end if;
  if v_dep_status not in ('completed','approved','done','not_applicable','cancelled','canceled') then
    raise exception 'Finish the previous workflow step before starting this one';
  end if;
  return new;
end
$function$;

CREATE OR REPLACE FUNCTION private.nexus_sync_task_owner()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if tg_op = 'INSERT' then
    if new.owner_scope is null then
      new.owner_scope := lower(coalesce(new.assignee, 'client'));
    else
      new.owner_scope := lower(new.owner_scope);
      new.assignee := new.owner_scope;
    end if;
  elsif new.owner_scope is distinct from old.owner_scope
    and new.assignee is distinct from old.assignee
    and lower(new.owner_scope) <> lower(new.assignee) then
    raise exception 'Task owner_scope and assignee cannot disagree';
  elsif new.owner_scope is distinct from old.owner_scope then
    new.owner_scope := lower(new.owner_scope);
    new.assignee := new.owner_scope;
  elsif new.assignee is distinct from old.assignee then
    new.assignee := lower(new.assignee);
    new.owner_scope := new.assignee;
  end if;
  if new.owner_scope not in ('client','nexus') then
    raise exception 'Task owner must be client or nexus';
  end if;
  return new;
end
$function$;
CREATE OR REPLACE FUNCTION public.nexus_is_company_creator(p_company_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  select exists (
    select 1 from public.nexus_companies c
    where c.id = p_company_id
      and c.created_by = auth.uid()
  );
$function$;

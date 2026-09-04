-- Nexus Action Item Processing Engine
-- Additive workflow metadata, immutable task event history, governed transitions,
-- notifications, and project conversion for every Nexus action item.

alter table public.nexus_tasks
  add column if not exists owner_user_id uuid references auth.users(id) on delete set null,
  add column if not exists required_evidence jsonb not null default '[]'::jsonb,
  add column if not exists completion_criteria jsonb not null default '[]'::jsonb,
  add column if not exists workflow_metadata jsonb not null default '{}'::jsonb,
  add column if not exists help_requested_at timestamptz,
  add column if not exists help_requested_by uuid references auth.users(id) on delete set null,
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references auth.users(id) on delete set null,
  add column if not exists converted_to_project_id uuid references public.nexus_projects(id) on delete set null,
  add column if not exists converted_to_project_at timestamptz,
  add column if not exists converted_to_project_by uuid references auth.users(id) on delete set null;

alter table public.nexus_action_templates
  add column if not exists required_evidence jsonb not null default '[]'::jsonb,
  add column if not exists completion_criteria jsonb not null default '[]'::jsonb,
  add column if not exists workflow_metadata jsonb not null default '{}'::jsonb;

-- Every existing action receives an explicit evidence expectation and definition of done.
update public.nexus_tasks
set required_evidence = case
  when task_type in ('upload','workflow_evidence') then jsonb_build_array(jsonb_build_object('label','Relevant supporting file or current-state evidence','required',true,'kind','file'))
  when task_type = 'preparation_checklist' then jsonb_build_array(jsonb_build_object('label','All applicable preparation checklist items addressed','required',true,'kind','checklist'))
  when task_type in ('structured_form','decision','approval','access','discovery_information_request') then jsonb_build_array(jsonb_build_object('label','Complete response and any supporting context requested in this action','required',true,'kind','response'))
  when assignee = 'nexus' then jsonb_build_array(jsonb_build_object('label','Nexus work product, review note, or implementation evidence','required',true,'kind','internal'))
  else jsonb_build_array(jsonb_build_object('label','Completion note or supporting evidence appropriate to this action','required',true,'kind','response'))
end
where required_evidence = '[]'::jsonb;

update public.nexus_tasks
set completion_criteria = case
  when task_type in ('upload','workflow_evidence') then jsonb_build_array('Required evidence is attached to the action','The submission has enough context for Nexus to review without guessing')
  when task_type = 'preparation_checklist' then jsonb_build_array('Every applicable checklist item is addressed','The checklist is submitted back to Nexus for review')
  when task_type = 'approval' then jsonb_build_array('The requested decision is explicit','Any conditions or requested changes are documented')
  when task_type = 'access' then jsonb_build_array('Approved access method or access context is documented','No passwords, MFA codes, API secrets, or payment-card data are placed in comments')
  when assignee = 'nexus' then jsonb_build_array('The described Nexus work is completed','The result or next handoff is documented in the shared record')
  else jsonb_build_array('Required fields or responses are complete','The action is ready for the next owner without additional clarification')
end
where completion_criteria = '[]'::jsonb;

update public.nexus_action_templates
set required_evidence = case
  when task_type in ('upload','workflow_evidence') then jsonb_build_array(jsonb_build_object('label','Relevant supporting file or current-state evidence','required',true,'kind','file'))
  when task_type = 'preparation_checklist' then jsonb_build_array(jsonb_build_object('label','All applicable preparation checklist items addressed','required',true,'kind','checklist'))
  when task_type in ('structured_form','decision','approval','access') then jsonb_build_array(jsonb_build_object('label','Complete response and supporting context','required',true,'kind','response'))
  when assignee = 'nexus' then jsonb_build_array(jsonb_build_object('label','Nexus work product or completion note','required',true,'kind','internal'))
  else jsonb_build_array(jsonb_build_object('label','Completion note or supporting evidence','required',true,'kind','response'))
end
where required_evidence = '[]'::jsonb;

update public.nexus_action_templates
set completion_criteria = case
  when task_type in ('upload','workflow_evidence') then jsonb_build_array('Required evidence is attached','Submission is ready for Nexus review')
  when task_type = 'approval' then jsonb_build_array('Decision is explicit','Conditions or requested changes are documented')
  when assignee = 'nexus' then jsonb_build_array('Nexus work is complete','Result and next handoff are documented')
  else jsonb_build_array('Requested work is complete','The next owner can proceed without clarification')
end
where completion_criteria = '[]'::jsonb;

create table if not exists public.nexus_task_events (
  id bigint generated by default as identity primary key,
  company_id uuid not null references public.nexus_companies(id) on delete cascade,
  task_id uuid not null references public.nexus_tasks(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  actor_scope text not null check (actor_scope in ('client','nexus','system')),
  event_type text not null,
  from_status text,
  to_status text,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists nexus_task_events_task_created_idx on public.nexus_task_events(task_id,created_at desc);
create index if not exists nexus_task_events_company_created_idx on public.nexus_task_events(company_id,created_at desc);

alter table public.nexus_task_events enable row level security;
revoke all on table public.nexus_task_events from anon, authenticated;
grant select on table public.nexus_task_events to authenticated;

drop policy if exists "nexus members view task events" on public.nexus_task_events;
create policy "nexus members view task events"
on public.nexus_task_events
for select
to authenticated
using (public.nexus_is_platform_admin() or public.nexus_is_company_member(company_id));

create or replace function private.nexus_task_actor_scope()
returns text
language sql
stable
security definer
set search_path = ''
as $function$
  select case
    when auth.uid() is null then 'system'
    when public.nexus_is_platform_admin() then 'nexus'
    else 'client'
  end;
$function$;

revoke all on function private.nexus_task_actor_scope() from public, anon, authenticated;

create or replace function private.nexus_capture_task_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_type text;
  v_detail jsonb := '{}'::jsonb;
begin
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
$function$;

revoke all on function private.nexus_capture_task_event() from public, anon, authenticated;

drop trigger if exists nexus_task_event_capture on public.nexus_tasks;
create trigger nexus_task_event_capture
after insert or update on public.nexus_tasks
for each row execute function private.nexus_capture_task_event();

create or replace function private.nexus_capture_task_comment_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  insert into public.nexus_task_events(company_id,task_id,actor_id,actor_scope,event_type,detail)
  values(new.company_id,new.task_id,new.author_id,private.nexus_task_actor_scope(),'commented',jsonb_build_object('comment_id',new.id));
  return new;
end
$function$;

revoke all on function private.nexus_capture_task_comment_event() from public, anon, authenticated;

drop trigger if exists nexus_task_comment_event_capture on public.nexus_task_comments;
create trigger nexus_task_comment_event_capture
after insert on public.nexus_task_comments
for each row execute function private.nexus_capture_task_comment_event();

create or replace function public.nexus_start_task(p_task_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v public.nexus_tasks%rowtype;
  v_admin boolean := public.nexus_is_platform_admin();
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v from public.nexus_tasks where id=p_task_id for update;
  if v.id is null then raise exception 'Task not found'; end if;
  if v.archived_at is not null then raise exception 'Archived actions cannot be started'; end if;

  if not v_admin then
    if not public.nexus_is_company_member(v.company_id) then raise exception 'Company membership required'; end if;
    if v.assignee <> 'client' then raise exception 'This action is not assigned to the client'; end if;
    if v.status not in ('waiting_on_client','not_started','open','needs_revision') then raise exception 'This action cannot be started from its current state'; end if;
  else
    if v.status not in ('waiting_on_client','not_started','open','needs_revision','blocked') then raise exception 'This action cannot be started from its current state'; end if;
  end if;

  if v.dependency_task_id is not null and not exists(
    select 1 from public.nexus_tasks d where d.id=v.dependency_task_id and d.status in ('approved','completed','done','not_applicable') and d.archived_at is null
  ) then raise exception 'A prerequisite must be completed first'; end if;

  update public.nexus_tasks
  set status='in_progress',updated_at=now()
  where id=v.id;

  insert into public.nexus_activity_log(company_id,actor_id,action,entity_type,entity_id,summary)
  values(v.company_id,auth.uid(),'task_started','task',v.id,'Action started: '||v.title);
  return v.id;
end
$function$;

grant execute on function public.nexus_start_task(uuid) to authenticated;

create or replace function public.nexus_request_task_help(p_task_id uuid,p_message text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v public.nexus_tasks%rowtype;
  a record;
  v_message text := nullif(trim(coalesce(p_message,'')),'');
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v from public.nexus_tasks where id=p_task_id for update;
  if v.id is null then raise exception 'Task not found'; end if;
  if v.archived_at is not null then raise exception 'Archived actions cannot request help'; end if;
  if not public.nexus_is_company_member(v.company_id) then raise exception 'Company membership required'; end if;
  if v.assignee <> 'client' then raise exception 'Help can only be requested on a client-owned action'; end if;
  if v.status not in ('waiting_on_client','not_started','open','in_progress','needs_revision','blocked') then raise exception 'This action is not currently actionable'; end if;

  if v_message is not null then
    insert into public.nexus_task_comments(company_id,task_id,author_id,body)
    values(v.company_id,v.id,auth.uid(),v_message);
  end if;

  update public.nexus_tasks
  set help_requested_at=now(),help_requested_by=auth.uid(),
      workflow_metadata=coalesce(workflow_metadata,'{}'::jsonb)||jsonb_build_object('help_requested',true),updated_at=now()
  where id=v.id;

  for a in select user_id from public.nexus_platform_admins loop
    insert into public.nexus_notifications(company_id,user_id,notification_type,title,message,related_type,related_id,created_by,action_url)
    values(v.company_id,a.user_id,'task_help','Client requested help: '||v.title,coalesce(v_message,'The client requested Nexus assistance with this action.'),'task',v.id,auth.uid(),'/portal');
  end loop;

  insert into public.nexus_activity_log(company_id,actor_id,action,entity_type,entity_id,summary)
  values(v.company_id,auth.uid(),'task_help_requested','task',v.id,'Client requested help: '||v.title);
  return v.id;
end
$function$;

grant execute on function public.nexus_request_task_help(uuid,text) to authenticated;

create or replace function public.nexus_submit_task_for_review(p_task_id uuid, p_response_data jsonb default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v public.nexus_tasks%rowtype;
  a record;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v from public.nexus_tasks where id=p_task_id for update;
  if v.id is null then raise exception 'Task not found'; end if;
  if v.archived_at is not null then raise exception 'Archived actions cannot be submitted'; end if;
  if not public.nexus_is_company_member(v.company_id) then raise exception 'Company membership required'; end if;
  if v.assignee <> 'client' then raise exception 'This task is not assigned to the client'; end if;
  if not v.notify_client then raise exception 'This task has not been released to the client yet'; end if;
  if v.status not in ('waiting_on_client','not_started','open','in_progress','needs_revision') then raise exception 'This task is not currently actionable'; end if;
  if v.dependency_task_id is not null and not exists(
    select 1 from public.nexus_tasks d where d.id=v.dependency_task_id and d.status in ('approved','completed','done','not_applicable') and d.archived_at is null
  ) then raise exception 'A prerequisite must be completed first'; end if;

  update public.nexus_tasks
  set response_data=coalesce(p_response_data,response_data),
      response_updated_at=case when p_response_data is null then response_updated_at else now() end,
      status='ready_for_review',assignee='nexus',owner_scope='nexus',submitted_at=now(),review_note=null,
      workflow_metadata=coalesce(workflow_metadata,'{}'::jsonb)-'help_requested',updated_at=now()
  where id=p_task_id;

  for a in select user_id from public.nexus_platform_admins loop
    insert into public.nexus_notifications(company_id,user_id,notification_type,title,message,related_type,related_id,created_by,action_url)
    values(v.company_id,a.user_id,'task_review','Action ready for review: '||v.title,'A client action was submitted and is ready for Nexus review.','task',v.id,auth.uid(),'/portal');
  end loop;

  insert into public.nexus_activity_log(company_id,actor_id,action,entity_type,entity_id,summary)
  values(v.company_id,auth.uid(),'task_submitted','task',v.id,'Client submitted action for Nexus review: '||v.title);
  return v.id;
end
$function$;

grant execute on function public.nexus_submit_task_for_review(uuid,jsonb) to authenticated;

create or replace function public.nexus_approve_task(p_task_id uuid, p_note text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v public.nexus_tasks%rowtype;
  m record;
begin
  if not public.nexus_is_platform_admin() then raise exception 'Nexus administrator access required'; end if;
  select * into v from public.nexus_tasks where id=p_task_id for update;
  if v.id is null then raise exception 'Task not found'; end if;
  if v.archived_at is not null then raise exception 'Archived actions cannot be approved'; end if;
  if v.status <> 'ready_for_review' then raise exception 'Task is not ready for review'; end if;

  update public.nexus_tasks
  set status='completed',assignee='nexus',owner_scope='nexus',review_note=nullif(trim(coalesce(p_note,'')),''),
      reviewed_at=now(),completed_at=now(),updated_at=now()
  where id=p_task_id;

  for m in select user_id from public.nexus_company_members where company_id=v.company_id and active is true loop
    insert into public.nexus_notifications(company_id,user_id,notification_type,title,message,related_type,related_id,created_by,action_url)
    values(v.company_id,m.user_id,'task_approved','Action approved: '||v.title,'Nexus reviewed and completed this action.','task',v.id,auth.uid(),'/portal');
  end loop;

  insert into public.nexus_activity_log(company_id,actor_id,action,entity_type,entity_id,summary)
  values(v.company_id,auth.uid(),'task_approved','task',v.id,'Nexus approved action: '||v.title);
  return v.id;
end
$function$;

grant execute on function public.nexus_approve_task(uuid,text) to authenticated;

create or replace function public.nexus_request_task_revision(p_task_id uuid, p_note text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
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

grant execute on function public.nexus_request_task_revision(uuid,text) to authenticated;

create or replace function public.nexus_admin_task_action(
  p_task_id uuid,
  p_action text,
  p_note text default null,
  p_project_name text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v public.nexus_tasks%rowtype;
  v_project uuid;
  v_action text := lower(trim(coalesce(p_action,'')));
  m record;
begin
  if not public.nexus_is_platform_admin() then raise exception 'Nexus administrator access required'; end if;
  select * into v from public.nexus_tasks where id=p_task_id for update;
  if v.id is null then raise exception 'Task not found'; end if;

  if v_action = 'start' then
    if v.archived_at is not null then raise exception 'Archived actions cannot be started'; end if;
    if v.status not in ('not_started','open','waiting_on_client','needs_revision','blocked','in_progress') then raise exception 'Task cannot be started from its current state'; end if;
    update public.nexus_tasks set status='in_progress',assignee='nexus',owner_scope='nexus',updated_at=now() where id=v.id;

  elsif v_action = 'complete' then
    if v.archived_at is not null then raise exception 'Archived actions cannot be completed'; end if;
    update public.nexus_tasks
      set status='completed',assignee='nexus',owner_scope='nexus',review_note=nullif(trim(coalesce(p_note,'')),''),completed_at=now(),updated_at=now()
      where id=v.id;

  elsif v_action = 'archive' then
    if v.archived_at is null then
      update public.nexus_tasks
        set archived_at=now(),archived_by=auth.uid(),notify_client=false,
            status=case when status in ('completed','approved','done','not_applicable') then status else 'done' end,
            workflow_metadata=coalesce(workflow_metadata,'{}'::jsonb)||jsonb_build_object('archive_note',nullif(trim(coalesce(p_note,'')),'')),updated_at=now()
        where id=v.id;
    end if;

  elsif v_action = 'convert_to_project' then
    if v.archived_at is not null then raise exception 'Archived actions cannot be converted'; end if;
    v_project := coalesce(v.converted_to_project_id,v.project_id);
    if v.converted_to_project_id is null then
      insert into public.nexus_projects(company_id,name,service_type,status,summary,start_date,created_by,project_type,engagement_stage,owner_scope)
      values(v.company_id,coalesce(nullif(trim(coalesce(p_project_name,'')),''),v.title),'Action Item','planning',coalesce(v.description,v.instructions),current_date,auth.uid(),'action_item','build_test','nexus')
      returning id into v_project;
      update public.nexus_tasks
        set project_id=v_project,converted_to_project_id=v_project,converted_to_project_at=now(),converted_to_project_by=auth.uid(),updated_at=now()
        where id=v.id;
    end if;

  elsif v_action = 'assign_client' then
    if v.archived_at is not null then raise exception 'Archived actions cannot be reassigned'; end if;
    update public.nexus_tasks set assignee='client',owner_scope='client',status=case when status='draft' then 'waiting_on_client' else status end,notify_client=true,updated_at=now() where id=v.id;

  elsif v_action = 'assign_nexus' then
    if v.archived_at is not null then raise exception 'Archived actions cannot be reassigned'; end if;
    update public.nexus_tasks set assignee='nexus',owner_scope='nexus',notify_client=false,updated_at=now() where id=v.id;

  else
    raise exception 'Unsupported action: %', p_action;
  end if;

  insert into public.nexus_activity_log(company_id,actor_id,action,entity_type,entity_id,summary)
  values(v.company_id,auth.uid(),'task_'||v_action,'task',v.id,'Nexus '||replace(v_action,'_',' ')||': '||v.title);

  if v_action in ('complete','assign_client') then
    for m in select user_id from public.nexus_company_members where company_id=v.company_id and active is true loop
      insert into public.nexus_notifications(company_id,user_id,notification_type,title,message,related_type,related_id,created_by,action_url)
      values(v.company_id,m.user_id,'task',case when v_action='complete' then 'Action completed: ' else 'Action assigned to you: ' end||v.title,
        coalesce(nullif(trim(coalesce(p_note,'')),''),case when v_action='complete' then 'Nexus completed this action.' else 'This action is ready for your attention.' end),
        'task',v.id,auth.uid(),'/portal');
    end loop;
  end if;

  return case when v_action='convert_to_project' then v_project else v.id end;
end
$function$;

grant execute on function public.nexus_admin_task_action(uuid,text,text,text) to authenticated;

-- Copy workflow definitions from reusable templates into newly assigned tasks.
create or replace function public.nexus_assign_action_template(p_company_id uuid, p_project_id uuid, p_template_code text, p_due_date date default null, p_priority text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  t public.nexus_action_templates%rowtype;
  v_id uuid;
  v_project uuid;
begin
  if not public.nexus_is_platform_admin() then raise exception 'Nexus administrator access required'; end if;
  select * into t from public.nexus_action_templates where code=p_template_code and active is true;
  if t.id is null then raise exception 'Action template not found'; end if;
  if not exists(select 1 from public.nexus_companies c where c.id=p_company_id) then raise exception 'Company not found'; end if;
  v_project:=p_project_id;
  if v_project is null then select p.id into v_project from public.nexus_projects p where p.company_id=p_company_id order by p.created_at desc limit 1; end if;
  if v_project is null or not exists(select 1 from public.nexus_projects p where p.id=v_project and p.company_id=p_company_id) then raise exception 'Project not found for this company'; end if;

  insert into public.nexus_tasks(
    company_id,project_id,title,description,instructions,assignee,owner_scope,status,priority,due_date,task_type,form_schema,template_code,created_by,notify_client,phase,required_evidence,completion_criteria,workflow_metadata
  ) values(
    p_company_id,v_project,t.title,t.description,t.instructions,t.assignee,t.assignee,
    case when t.assignee='client' then 'waiting_on_client' else 'not_started' end,
    coalesce(nullif(p_priority,''),t.priority),p_due_date,t.task_type,t.form_schema,t.code,auth.uid(),t.assignee='client',t.phase,t.required_evidence,t.completion_criteria,t.workflow_metadata
  ) returning id into v_id;
  return v_id;
end
$function$;

grant execute on function public.nexus_assign_action_template(uuid,uuid,text,date,text) to authenticated;

create or replace function public.nexus_assign_action_package(p_company_id uuid, p_project_id uuid, p_package_code text, p_start_date date default current_date)
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  pkg public.nexus_action_packages%rowtype;
  item record;
  tmpl public.nexus_action_templates%rowtype;
  v_project uuid;
  v_id uuid;
  v_count int := 0;
  v_dep uuid;
begin
  if not public.nexus_is_platform_admin() then raise exception 'Nexus administrator access required'; end if;
  select * into pkg from public.nexus_action_packages where code=p_package_code and active=true;
  if pkg.id is null then raise exception 'Action package not found'; end if;
  if not exists(select 1 from public.nexus_companies c where c.id=p_company_id) then raise exception 'Company not found'; end if;
  v_project:=p_project_id;
  if v_project is null then select p.id into v_project from public.nexus_projects p where p.company_id=p_company_id order by p.created_at desc limit 1; end if;
  if v_project is null or not exists(select 1 from public.nexus_projects p where p.id=v_project and p.company_id=p_company_id) then raise exception 'Project not found for this company'; end if;

  for item in select i.* from public.nexus_action_package_items i where i.package_id=pkg.id order by i.sort_order loop
    select * into tmpl from public.nexus_action_templates where code=item.template_code and active=true;
    if tmpl.id is null then continue; end if;
    select t.id into v_id from public.nexus_tasks t where t.company_id=p_company_id and t.project_id=v_project and t.package_code=p_package_code and t.template_code=item.template_code order by t.created_at desc limit 1;
    if v_id is not null then continue; end if;
    v_dep:=null;
    if item.depends_on_template_code is not null then
      select t.id into v_dep from public.nexus_tasks t where t.company_id=p_company_id and t.project_id=v_project and t.package_code=p_package_code and t.template_code=item.depends_on_template_code order by t.created_at desc limit 1;
      if v_dep is null then raise exception 'Package prerequisite task is missing: %', item.depends_on_template_code; end if;
    end if;

    insert into public.nexus_tasks(
      company_id,project_id,title,description,instructions,assignee,owner_scope,status,priority,due_date,task_type,form_schema,template_code,created_by,notify_client,phase,package_code,dependency_task_id,sort_order,required_evidence,completion_criteria,workflow_metadata
    ) values(
      p_company_id,v_project,tmpl.title,tmpl.description,tmpl.instructions,tmpl.assignee,tmpl.assignee,
      case when tmpl.assignee='client' then 'waiting_on_client' else 'not_started' end,
      tmpl.priority,case when item.due_offset_days is null then null else p_start_date+item.due_offset_days end,
      tmpl.task_type,tmpl.form_schema,tmpl.code,auth.uid(),tmpl.assignee='client',tmpl.phase,p_package_code,v_dep,item.sort_order,tmpl.required_evidence,tmpl.completion_criteria,tmpl.workflow_metadata
    ) returning id into v_id;
    v_count:=v_count+1;
  end loop;
  return v_count;
end
$function$;

grant execute on function public.nexus_assign_action_package(uuid,uuid,text,date) to authenticated;

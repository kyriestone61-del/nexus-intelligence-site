-- Preserve a strict direct-update boundary while allowing the governed client RPCs
-- to perform their exact help-request and review-handoff mutations.

create or replace function private.nexus_enforce_task_update_boundary()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_context text := coalesce(current_setting('nexus.workflow_context', true),'');
begin
  if auth.uid() is null then return new; end if;
  if public.nexus_is_platform_admin() then return new; end if;

  if old.assignee <> 'client' or not public.nexus_is_company_member(old.company_id) then
    raise exception 'Only Nexus can modify this action item';
  end if;

  if v_context='help_request' then
    if (to_jsonb(new) - array['help_requested_at','help_requested_by','workflow_metadata','updated_at'])
       is distinct from
       (to_jsonb(old) - array['help_requested_at','help_requested_by','workflow_metadata','updated_at']) then
      raise exception 'Invalid governed help-request update';
    end if;
    return new;
  end if;

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

create or replace function public.nexus_request_task_help(p_task_id uuid,p_message text default null)
returns uuid
language plpgsql
security definer
set search_path to ''
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
    insert into public.nexus_task_comments(company_id,task_id,author_id,body) values(v.company_id,v.id,auth.uid(),v_message);
  end if;

  perform set_config('nexus.workflow_context','help_request',true);
  update public.nexus_tasks
  set help_requested_at=now(),help_requested_by=auth.uid(),workflow_metadata=coalesce(workflow_metadata,'{}'::jsonb)||jsonb_build_object('help_requested',true),updated_at=now()
  where id=v.id;
  perform set_config('nexus.workflow_context','',true);

  for a in select user_id from public.nexus_platform_admins loop
    insert into public.nexus_notifications(company_id,user_id,notification_type,title,message,related_type,related_id,created_by,action_url)
    values(v.company_id,a.user_id,'task_help','Client requested help: '||v.title,coalesce(v_message,'The client requested Nexus assistance with this action.'),'task',v.id,auth.uid(),'/portal');
  end loop;

  insert into public.nexus_activity_log(company_id,actor_id,action,entity_type,entity_id,summary)
  values(v.company_id,auth.uid(),'task_help_requested','task',v.id,'Client requested help: '||v.title);
  return v.id;
end
$function$;

revoke execute on function public.nexus_request_task_help(uuid,text) from public,anon;
grant execute on function public.nexus_request_task_help(uuid,text) to authenticated;

-- Nexus consolidated client action-state architecture
-- Mirrors the production migrations applied on 2026-09-01.

create index if not exists nexus_tasks_dependency_task_id_idx
  on public.nexus_tasks(dependency_task_id)
  where dependency_task_id is not null;

create or replace function private.nexus_client_action_context_unchecked(p_company_id uuid)
returns table(
  task_id uuid,
  canonical_state text,
  prerequisites_satisfied boolean,
  blocked_by_task_id uuid,
  blocked_by_title text,
  dependency_depth integer,
  cycle_detected boolean
)
language sql
stable
security definer
set search_path = ''
as $function$
  with recursive roots as (
    select
      t.id as root_id,
      t.dependency_task_id as current_id,
      array[t.id]::uuid[] as path,
      0::integer as depth,
      false as cycle
    from public.nexus_tasks t
    where t.company_id = p_company_id
      and lower(coalesce(t.assignee,'')) = 'client'
  ), walk as (
    select * from roots
    union all
    select
      w.root_id,
      p.dependency_task_id as current_id,
      w.path || p.id,
      w.depth + 1,
      p.id = any(w.path) as cycle
    from walk w
    join public.nexus_tasks p on p.id = w.current_id
    where w.current_id is not null
      and not w.cycle
      and w.depth < 100
  ), graph as (
    select
      t.id as task_id,
      coalesce(bool_or(w.cycle), false) as cycle_detected,
      coalesce(max(w.depth), 0)::integer as dependency_depth
    from public.nexus_tasks t
    left join walk w on w.root_id = t.id
    where t.company_id = p_company_id
      and lower(coalesce(t.assignee,'')) = 'client'
    group by t.id
  )
  select
    t.id,
    case
      when lower(coalesce(t.status,'')) in ('complete','completed','done','resolved','approved','released','implemented','closed') then 'COMPLETE'
      when lower(coalesce(t.status,'')) in ('blocked','failed','delayed','attention','action_required') then 'BLOCKED'
      when g.cycle_detected or blocker.parent_id is not null then 'UPCOMING'
      when lower(coalesce(t.status,'')) in ('ready_for_review','in_review','pending_review','submitted','reviewing') then 'NEXUS_WORKING'
      else 'WAITING_ON_YOU'
    end,
    (not g.cycle_detected and blocker.parent_id is null),
    blocker.parent_id,
    case when g.cycle_detected then 'Dependency cycle requires Nexus review' else blocker.parent_title end,
    g.dependency_depth,
    g.cycle_detected
  from public.nexus_tasks t
  join graph g on g.task_id = t.id
  left join lateral (
    select
      coalesce(parent.id, w.current_id) as parent_id,
      coalesce(parent.title, 'Required prerequisite') as parent_title,
      w.depth
    from walk w
    left join public.nexus_tasks parent on parent.id = w.current_id
    where w.root_id = t.id
      and w.current_id is not null
      and (
        parent.id is null
        or lower(coalesce(parent.status,'')) not in ('complete','completed','done','resolved','approved','released','implemented','closed')
      )
    order by w.depth asc
    limit 1
  ) blocker on true
  where t.company_id = p_company_id
    and lower(coalesce(t.assignee,'')) = 'client'
$function$;

revoke all on function private.nexus_client_action_context_unchecked(uuid) from public;
revoke all on function private.nexus_client_action_context_unchecked(uuid) from anon;
revoke all on function private.nexus_client_action_context_unchecked(uuid) from authenticated;

create or replace function public.nexus_get_client_action_context(p_company_id uuid)
returns table(
  task_id uuid,
  canonical_state text,
  prerequisites_satisfied boolean,
  blocked_by_task_id uuid,
  blocked_by_title text,
  dependency_depth integer,
  cycle_detected boolean
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user uuid := auth.uid();
  v_admin boolean := public.nexus_is_platform_admin();
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if p_company_id is null then raise exception 'Company is required'; end if;
  if not v_admin and not public.nexus_is_company_member(p_company_id) then raise exception 'Company membership required'; end if;
  return query select * from private.nexus_client_action_context_unchecked(p_company_id);
end
$function$;

grant execute on function public.nexus_get_client_action_context(uuid) to authenticated;

create or replace function private.nexus_notify_client_on_task()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare m record;
begin
  if new.assignee <> 'client' or new.notify_client is false or new.status='draft' then return new; end if;
  if not exists (
    select 1
    from private.nexus_client_action_context_unchecked(new.company_id) ctx
    where ctx.task_id=new.id and ctx.canonical_state='WAITING_ON_YOU'
  ) then return new; end if;
  if tg_op='UPDATE' then
    if not ((old.status='draft' and new.status<>'draft') or (old.notify_client is false and new.notify_client is true)) then return new; end if;
  end if;
  for m in select cm.user_id from public.nexus_company_members cm where cm.company_id=new.company_id and cm.active is true loop
    if not exists (select 1 from public.nexus_notifications n where n.user_id=m.user_id and n.related_type='task' and n.related_id=new.id) then
      insert into public.nexus_notifications(company_id,user_id,notification_type,title,message,related_type,related_id,created_by,action_url)
      values(new.company_id,m.user_id,'task','New Nexus action: '||new.title,coalesce(new.description,'A new action item was added to your Nexus workspace.'),'task',new.id,new.created_by,'/portal');
    end if;
    perform private.nexus_enqueue_member_email(
      m.user_id,new.company_id,'task','New Nexus action: '||new.title,
      coalesce(new.description,'A new action item was added to your Nexus workspace.')||case when new.due_date is not null then ' Due: '||new.due_date::text||'.' else '' end,
      '/portal','task',new.id,'task:'||new.id::text||':'||m.user_id::text,
      jsonb_build_object('due_date',new.due_date,'priority',new.priority,'canonical_state','WAITING_ON_YOU')
    );
  end loop;
  return new;
end
$function$;

create or replace function private.nexus_notify_newly_unblocked_client_tasks()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  t record;
  m record;
  old_complete boolean := lower(coalesce(old.status,'')) in ('complete','completed','done','resolved','approved','released','implemented','closed');
  new_complete boolean := lower(coalesce(new.status,'')) in ('complete','completed','done','resolved','approved','released','implemented','closed');
begin
  if old_complete or not new_complete then return new; end if;
  for t in
    select task.*
    from public.nexus_tasks task
    join private.nexus_client_action_context_unchecked(new.company_id) ctx on ctx.task_id=task.id
    where task.company_id=new.company_id
      and task.assignee='client'
      and task.notify_client is true
      and ctx.canonical_state='WAITING_ON_YOU'
  loop
    for m in select cm.user_id from public.nexus_company_members cm where cm.company_id=t.company_id and cm.active is true loop
      if not exists (select 1 from public.nexus_notifications n where n.user_id=m.user_id and n.related_type='task' and n.related_id=t.id) then
        insert into public.nexus_notifications(company_id,user_id,notification_type,title,message,related_type,related_id,created_by,action_url)
        values(t.company_id,m.user_id,'task','New Nexus action: '||t.title,coalesce(t.description,'A new action item is now ready in your Nexus workspace.'),'task',t.id,t.created_by,'/portal');
        perform private.nexus_enqueue_member_email(
          m.user_id,t.company_id,'task','New Nexus action: '||t.title,
          coalesce(t.description,'A new action item is now ready in your Nexus workspace.')||case when t.due_date is not null then ' Due: '||t.due_date::text||'.' else '' end,
          '/portal','task',t.id,'task:'||t.id::text||':'||m.user_id::text,
          jsonb_build_object('due_date',t.due_date,'priority',t.priority,'canonical_state','WAITING_ON_YOU','released_by_dependency',new.id)
        );
      end if;
    end loop;
  end loop;
  return new;
end
$function$;

drop trigger if exists nexus_release_unblocked_client_tasks on public.nexus_tasks;
create trigger nexus_release_unblocked_client_tasks
after update of status on public.nexus_tasks
for each row execute function private.nexus_notify_newly_unblocked_client_tasks();

create or replace function public.nexus_queue_action_digests()
returns integer
language plpgsql
security definer
set search_path to 'pg_catalog','public'
as $function$
declare
  r record;
  v_count integer:=0;
  v_tasks integer;
  v_approvals integer;
  v_docs integer;
  v_primary text;
begin
  for r in
    select cm.company_id,cm.user_id,np.digest_cadence
    from public.nexus_company_members cm
    left join public.nexus_notification_preferences np on np.company_id=cm.company_id and np.user_id=cm.user_id
    where cm.active is true and coalesce(np.email_enabled,true) and coalesce(np.digest_cadence,'daily')<>'off'
  loop
    select count(*)::integer into v_tasks
    from private.nexus_client_action_context_unchecked(r.company_id) ctx
    where ctx.canonical_state='WAITING_ON_YOU';

    select t.title into v_primary
    from private.nexus_client_action_context_unchecked(r.company_id) ctx
    join public.nexus_tasks t on t.id=ctx.task_id
    where ctx.canonical_state='WAITING_ON_YOU'
    order by
      case lower(coalesce(t.priority,'normal')) when 'critical' then 0 when 'high' then 1 when 'normal' then 2 when 'low' then 3 else 2 end,
      t.due_date asc nulls last,
      t.created_at asc
    limit 1;

    select count(*) into v_approvals from public.nexus_approvals a where a.company_id=r.company_id and a.status='pending';
    select count(*) into v_docs from public.nexus_document_requests d where d.company_id=r.company_id and d.status='requested' and coalesce(d.owner_scope,'client')='client';

    if v_tasks+v_approvals+v_docs>0 then
      perform private.nexus_enqueue_member_email(
        r.user_id,r.company_id,'digest','Your Nexus action summary',
        case when v_tasks>0 then 'Your current Nexus action queue has '||v_tasks||' dependency-cleared action item(s).'||case when v_primary is not null then ' Your next step is: '||v_primary||'.' else '' end else 'No dependency-cleared client task is waiting right now.' end||
        ' You also have '||v_approvals||' pending approval(s) and '||v_docs||' outstanding document request(s). Open Nexus to see the single ordered next step and grouped evidence requests.',
        '/portal','company',r.company_id,'digest:'||current_date::text||':'||r.user_id::text,
        jsonb_build_object('dependency_cleared_tasks',v_tasks,'pending_approvals',v_approvals,'document_requests',v_docs,'primary_action',v_primary)
      );
      v_count:=v_count+1;
    end if;
  end loop;
  return v_count;
end
$function$;

-- A revoked release must not remain readable by client members.
drop policy if exists "nexus members view released diagnosis reports" on public.nexus_diagnosis_report_releases;
create policy "nexus members view released diagnosis reports"
on public.nexus_diagnosis_report_releases
for select
to authenticated
using (
  status = 'released'
  and revoked_at is null
  and public.nexus_is_company_member(company_id)
);

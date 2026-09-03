-- Make the client diagnosis-approval path coherent end to end.
-- A diagnosis approval cannot become actionable before a client-safe report is released.
-- Releasing/re-releasing a report opens the matching client approval task.
-- A client report decision synchronizes that task to COMPLETE or NEXUS_WORKING.

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
set search_path=''
as $$
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
      when coalesce(diagnosis_gate.blocked,false) or g.cycle_detected or blocker.parent_id is not null then 'UPCOMING'
      when lower(coalesce(t.status,'')) in ('ready_for_review','in_review','pending_review','submitted','reviewing') then 'NEXUS_WORKING'
      else 'WAITING_ON_YOU'
    end,
    (not coalesce(diagnosis_gate.blocked,false) and not g.cycle_detected and blocker.parent_id is null),
    blocker.parent_id,
    case
      when coalesce(diagnosis_gate.blocked,false) then 'Nexus releases your diagnosis report'
      when g.cycle_detected then 'Dependency cycle requires Nexus review'
      else blocker.parent_title
    end,
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
  left join lateral (
    select true as blocked
    where lower(coalesce(t.task_type,''))='approval'
      and lower(coalesce(t.phase,''))='diagnosis'
      and t.source_diagnosis_run_id is not null
      and not exists (
        select 1
        from public.nexus_diagnosis_report_releases r
        where r.diagnosis_run_id=t.source_diagnosis_run_id
          and r.company_id=t.company_id
          and r.status='released'
          and r.revoked_at is null
      )
  ) diagnosis_gate on true
  where t.company_id = p_company_id
    and lower(coalesce(t.assignee,'')) = 'client'
$$;

revoke all on function private.nexus_client_action_context_unchecked(uuid) from public,anon,authenticated;

create or replace function public.nexus_release_client_task(p_task_id uuid)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  t public.nexus_tasks%rowtype;
begin
  if not public.nexus_is_platform_admin() then raise exception 'Nexus administrator access required'; end if;
  select * into t from public.nexus_tasks where id=p_task_id for update;
  if t.id is null then raise exception 'Task not found'; end if;
  if t.assignee<>'client' then raise exception 'Only client tasks can be released to the client'; end if;

  if lower(coalesce(t.task_type,''))='approval'
     and lower(coalesce(t.phase,''))='diagnosis'
     and t.source_diagnosis_run_id is not null
     and not exists (
       select 1 from public.nexus_diagnosis_report_releases r
       where r.diagnosis_run_id=t.source_diagnosis_run_id
         and r.company_id=t.company_id
         and r.status='released'
         and r.revoked_at is null
     ) then
    raise exception 'Release the client-safe diagnosis report before releasing this approval task';
  end if;

  perform private.nexus_require_entity_chain_approved('client_task_release',t.id);
  if t.status='draft' then
    update public.nexus_tasks
    set status='waiting_on_client',notify_client=true,updated_at=now()
    where id=t.id;
  elsif t.notify_client is false then
    update public.nexus_tasks set notify_client=true,updated_at=now() where id=t.id;
  end if;
  return t.id;
end
$$;

revoke all on function public.nexus_release_client_task(uuid) from public,anon;
grant execute on function public.nexus_release_client_task(uuid) to authenticated;

create or replace function private.nexus_open_diagnosis_approval_on_report_release()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if new.status='released' and new.revoked_at is null then
    update public.nexus_tasks t
    set status='waiting_on_client',
        notify_client=true,
        submitted_at=null,
        reviewed_at=null,
        completed_at=null,
        updated_at=now()
    where t.company_id=new.company_id
      and t.project_id is not distinct from new.project_id
      and t.source_diagnosis_run_id=new.diagnosis_run_id
      and lower(coalesce(t.assignee,''))='client'
      and lower(coalesce(t.task_type,''))='approval'
      and lower(coalesce(t.phase,''))='diagnosis'
      and lower(coalesce(t.status,'')) not in ('cancelled','canceled','archived');
  end if;
  return new;
end
$$;

revoke all on function private.nexus_open_diagnosis_approval_on_report_release() from public,anon,authenticated;

drop trigger if exists nexus_open_diagnosis_approval_on_report_release on public.nexus_diagnosis_report_releases;
create trigger nexus_open_diagnosis_approval_on_report_release
after insert or update of status,report_version,released_at,revoked_at
on public.nexus_diagnosis_report_releases
for each row execute function private.nexus_open_diagnosis_approval_on_report_release();

create or replace function private.nexus_sync_diagnosis_approval_from_client_decision()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_release public.nexus_diagnosis_report_releases%rowtype;
  v_payload jsonb;
begin
  select * into v_release from public.nexus_diagnosis_report_releases where id=new.release_id;
  if v_release.id is null then return new; end if;

  v_payload:=jsonb_strip_nulls(jsonb_build_object(
    'diagnosis_report_release_id',new.release_id,
    'diagnosis_report_version',new.report_version,
    'diagnosis_decision',new.decision,
    'diagnosis_decision_note',new.note,
    'diagnosis_decided_at',new.decided_at
  ));

  if new.decision='approved' then
    update public.nexus_tasks t
    set status='completed',
        response_data=coalesce(t.response_data,'{}'::jsonb)||v_payload,
        response_updated_at=now(),
        submitted_at=coalesce(t.submitted_at,now()),
        reviewed_at=now(),
        completed_at=now(),
        updated_at=now()
    where t.company_id=v_release.company_id
      and t.project_id is not distinct from v_release.project_id
      and t.source_diagnosis_run_id=v_release.diagnosis_run_id
      and lower(coalesce(t.assignee,''))='client'
      and lower(coalesce(t.task_type,''))='approval'
      and lower(coalesce(t.phase,''))='diagnosis'
      and lower(coalesce(t.status,'')) not in ('cancelled','canceled','archived');
  elsif new.decision='changes_requested' then
    update public.nexus_tasks t
    set status='ready_for_review',
        response_data=coalesce(t.response_data,'{}'::jsonb)||v_payload,
        response_updated_at=now(),
        submitted_at=now(),
        reviewed_at=null,
        completed_at=null,
        updated_at=now()
    where t.company_id=v_release.company_id
      and t.project_id is not distinct from v_release.project_id
      and t.source_diagnosis_run_id=v_release.diagnosis_run_id
      and lower(coalesce(t.assignee,''))='client'
      and lower(coalesce(t.task_type,''))='approval'
      and lower(coalesce(t.phase,''))='diagnosis'
      and lower(coalesce(t.status,'')) not in ('cancelled','canceled','archived');
  end if;
  return new;
end
$$;

revoke all on function private.nexus_sync_diagnosis_approval_from_client_decision() from public,anon,authenticated;

drop trigger if exists nexus_sync_diagnosis_approval_from_client_decision on public.nexus_diagnosis_report_client_decisions;
create trigger nexus_sync_diagnosis_approval_from_client_decision
after insert or update of decision,note,decided_at,report_version
on public.nexus_diagnosis_report_client_decisions
for each row execute function private.nexus_sync_diagnosis_approval_from_client_decision();

-- Repair already-exposed diagnosis approval tasks that have no released report.
-- Real clients cannot see draft tasks; the report-release trigger reopens them automatically.
update public.nexus_tasks t
set status='draft',notify_client=false,updated_at=now()
where lower(coalesce(t.assignee,''))='client'
  and lower(coalesce(t.task_type,''))='approval'
  and lower(coalesce(t.phase,''))='diagnosis'
  and t.source_diagnosis_run_id is not null
  and lower(coalesce(t.status,'')) not in ('complete','completed','done','resolved','approved','released','implemented','closed','cancelled','canceled','archived')
  and not exists (
    select 1 from public.nexus_diagnosis_report_releases r
    where r.diagnosis_run_id=t.source_diagnosis_run_id
      and r.company_id=t.company_id
      and r.status='released'
      and r.revoked_at is null
  );

-- Action Item Processing Engine field-level mutation guard.
-- RLS controls rows; this trigger prevents client members from using a direct
-- table UPDATE to rewrite protected workflow fields or bypass governed handoffs.

create or replace function private.nexus_guard_client_task_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  -- PostgREST browser writes run as authenticated. SECURITY DEFINER RPCs run as
  -- their function owner and therefore remain able to perform governed transitions.
  if current_user <> 'authenticated' or public.nexus_is_platform_admin() then
    return new;
  end if;

  if auth.uid() is null or not public.nexus_is_company_member(old.company_id) then
    raise exception 'Company membership required';
  end if;
  if old.assignee <> 'client' or old.status = 'draft' or old.archived_at is not null then
    raise exception 'This action is not directly editable by the client';
  end if;

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
  then
    raise exception 'Protected action fields must be changed through a governed Nexus workflow';
  end if;

  if new.status is distinct from old.status and new.status <> 'in_progress' then
    raise exception 'Client status transitions must use the governed Nexus workflow';
  end if;

  return new;
end
$function$;

revoke all on function private.nexus_guard_client_task_update() from public, anon, authenticated;

drop trigger if exists nexus_guard_client_task_update on public.nexus_tasks;
create trigger nexus_guard_client_task_update
before update on public.nexus_tasks
for each row execute function private.nexus_guard_client_task_update();

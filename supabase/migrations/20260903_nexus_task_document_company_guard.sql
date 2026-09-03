create or replace function public.nexus_validate_document_task_company()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.task_id is not null and not exists (
    select 1
    from public.nexus_tasks t
    where t.id = new.task_id
      and t.company_id = new.company_id
  ) then
    raise exception 'Document task must belong to the same company';
  end if;
  return new;
end
$function$;

revoke all on function public.nexus_validate_document_task_company() from public;

drop trigger if exists nexus_documents_task_company_guard on public.nexus_documents;
create trigger nexus_documents_task_company_guard
before insert or update of task_id, company_id on public.nexus_documents
for each row execute function public.nexus_validate_document_task_company();

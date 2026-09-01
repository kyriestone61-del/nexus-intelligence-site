-- Nexus evidence lineage + actionable diagnosis task instructions

create or replace function public.nexus_validate_document_lineage()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_project_company uuid;
  v_requirement_company uuid;
  v_requirement_project uuid;
  v_request_company uuid;
  v_request_project uuid;
begin
  if new.project_id is not null then
    select company_id into v_project_company from public.nexus_projects where id=new.project_id;
    if v_project_company is null then raise exception 'Document project does not exist'; end if;
    if v_project_company<>new.company_id then raise exception 'Document project must belong to the same company'; end if;
  end if;

  if new.data_requirement_id is not null then
    select company_id,project_id into v_requirement_company,v_requirement_project
    from public.nexus_project_data_requirements where id=new.data_requirement_id;
    if v_requirement_company is null then raise exception 'Document data requirement does not exist'; end if;
    if v_requirement_company<>new.company_id then raise exception 'Document data requirement must belong to the same company'; end if;
    if new.project_id is null or v_requirement_project<>new.project_id then raise exception 'Document data requirement must belong to the same project'; end if;
  end if;

  if new.request_id is not null then
    select company_id,project_id into v_request_company,v_request_project
    from public.nexus_document_requests where id=new.request_id;
    if v_request_company is null then raise exception 'Document request does not exist'; end if;
    if v_request_company<>new.company_id then raise exception 'Document request must belong to the same company'; end if;
    if v_request_project is not null and (new.project_id is null or v_request_project<>new.project_id) then raise exception 'Document request must belong to the same project'; end if;
  end if;

  return new;
end
$$;

revoke all on function public.nexus_validate_document_lineage() from public,anon,authenticated;

drop trigger if exists nexus_documents_lineage_guard on public.nexus_documents;
create trigger nexus_documents_lineage_guard
before insert or update of company_id,project_id,data_requirement_id,request_id
on public.nexus_documents
for each row execute function public.nexus_validate_document_lineage();

create or replace function public.nexus_default_task_instructions()
returns trigger
language plpgsql
set search_path=''
as $$
begin
  if new.task_type='diagnosis_action' and nullif(btrim(coalesce(new.instructions,'')),'') is null then
    new.instructions:=nullif(btrim(coalesce(new.description,'')),'');
  end if;
  return new;
end
$$;

drop trigger if exists nexus_tasks_default_instructions on public.nexus_tasks;
create trigger nexus_tasks_default_instructions
before insert or update of task_type,description,instructions
on public.nexus_tasks
for each row execute function public.nexus_default_task_instructions();

update public.nexus_tasks
set instructions=description,updated_at=now()
where task_type='diagnosis_action'
  and nullif(btrim(coalesce(instructions,'')),'') is null
  and nullif(btrim(coalesce(description,'')),'') is not null;

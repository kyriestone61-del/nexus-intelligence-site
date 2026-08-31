-- Nexus diagnosis/client-journey contract hardening.
-- Keeps database behavior aligned with the human-reviewed diagnosis workflow.

create or replace function public.nexus_assign_action_template(
  p_company_id uuid,
  p_project_id uuid,
  p_template_code text,
  p_due_date date default null,
  p_priority text default null
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  t public.nexus_action_templates%rowtype;
  v_id uuid;
  v_project uuid;
begin
  if not public.nexus_is_platform_admin() then
    raise exception 'Nexus administrator access required';
  end if;

  select * into t
  from public.nexus_action_templates
  where code=p_template_code and active is true;
  if t.id is null then raise exception 'Action template not found'; end if;

  if not exists(select 1 from public.nexus_companies c where c.id=p_company_id) then
    raise exception 'Company not found';
  end if;

  v_project:=p_project_id;
  if v_project is null then
    select p.id into v_project
    from public.nexus_projects p
    where p.company_id=p_company_id
    order by p.created_at desc
    limit 1;
  end if;

  if v_project is null or not exists(
    select 1 from public.nexus_projects p
    where p.id=v_project and p.company_id=p_company_id
  ) then
    raise exception 'Project not found for this company';
  end if;

  insert into public.nexus_tasks(
    company_id,project_id,title,description,instructions,assignee,status,priority,
    due_date,task_type,form_schema,template_code,created_by,notify_client,phase
  )
  values(
    p_company_id,v_project,t.title,t.description,t.instructions,t.assignee,
    case when t.assignee='client' then 'waiting_on_client' else 'not_started' end,
    coalesce(nullif(p_priority,''),t.priority),p_due_date,t.task_type,t.form_schema,
    t.code,auth.uid(),t.assignee='client',t.phase
  )
  returning id into v_id;

  return v_id;
end
$function$;

revoke all on function public.nexus_assign_action_template(uuid,uuid,text,date,text) from public, anon;
grant execute on function public.nexus_assign_action_template(uuid,uuid,text,date,text) to authenticated, service_role;

-- The diagnosis model and manual fallback are human-reviewed inputs. Normalize
-- opportunity scores at the database boundary so an out-of-range model value
-- cannot dead-end approval while preserving the canonical 1-5 score contract.
create or replace function private.nexus_normalize_opportunity_scores()
returns trigger
language plpgsql
set search_path to ''
as $function$
begin
  if new.value_score is not null then
    new.value_score := greatest(1,least(5,new.value_score));
  end if;
  if new.effort_score is not null then
    new.effort_score := greatest(1,least(5,new.effort_score));
  end if;
  if new.readiness_score is not null then
    new.readiness_score := greatest(1,least(5,new.readiness_score));
  end if;
  return new;
end
$function$;

drop trigger if exists nexus_normalize_opportunity_scores on public.nexus_opportunities;
create trigger nexus_normalize_opportunity_scores
before insert or update of value_score,effort_score,readiness_score
on public.nexus_opportunities
for each row execute function private.nexus_normalize_opportunity_scores();

-- Diagnosis approval historically emitted draft + sensitive/restricted values,
-- while the canonical request table accepts requested and standard/confidential.
-- Normalize legacy/model vocabulary at the boundary so approval remains atomic.
create or replace function private.nexus_normalize_document_request_contract()
returns trigger
language plpgsql
set search_path to ''
as $function$
begin
  if new.status='draft' then
    new.status:='requested';
  end if;
  if new.sensitivity in ('sensitive','restricted') then
    new.sensitivity:='confidential';
  end if;
  return new;
end
$function$;

drop trigger if exists nexus_normalize_document_request_contract on public.nexus_document_requests;
create trigger nexus_normalize_document_request_contract
before insert or update of status,sensitivity
on public.nexus_document_requests
for each row execute function private.nexus_normalize_document_request_contract();

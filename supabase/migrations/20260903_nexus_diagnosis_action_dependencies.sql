-- Apply standardized action-package prerequisite semantics to diagnosis-generated tasks.
-- Safety rules:
--   * only active templates/packages participate
--   * only dependency rules with one unambiguous prerequisite participate
--   * only tasks from the same diagnosis run/company/project are linked
--   * prerequisites are never invented or linked across runs
--   * dependent template descriptions tell the diagnosis model about the prerequisite

create or replace function private.nexus_map_diagnosis_action_templates(p_run_id uuid)
returns integer
language plpgsql
security definer
set search_path to ''
as $function$
declare
  r public.nexus_diagnosis_runs%rowtype;
  item jsonb;
  t public.nexus_action_templates%rowtype;
  v_code text;
  mapped integer:=0;
  dependencies_applied integer:=0;
  dependencies_missing integer:=0;
  item_title text;
  who text;
begin
  select * into r from public.nexus_diagnosis_runs where id=p_run_id;
  if r.id is null or r.analysis_result is null then return 0; end if;

  for who in select unnest(array['nexus','client']) loop
    for item in select value from jsonb_array_elements(
      case when who='nexus' then coalesce(r.analysis_result->'nexus_actions','[]'::jsonb)
           else coalesce(r.analysis_result->'client_action_items','[]'::jsonb) end
    ) loop
      v_code:=nullif(btrim(coalesce(item->>'template_code','')),'');
      item_title:=coalesce(nullif(btrim(item->>'title'),''),case when who='nexus' then 'Nexus action' else 'Client action' end);
      if v_code is null then continue; end if;

      t:=null;
      select at.* into t
      from public.nexus_action_templates at
      where at.code=v_code and at.active is true
      limit 1;
      if t.id is null or t.assignee<>who then continue; end if;

      update public.nexus_tasks
      set template_code=t.code,
          instructions=coalesce(nullif(btrim(coalesce(item->>'instructions','')),''),t.instructions,instructions),
          task_type=coalesce(nullif(t.task_type,''),task_type),
          phase=coalesce(nullif(t.phase,''),phase),
          priority=coalesce(nullif(item->>'priority',''),t.priority,priority),
          form_schema=case when form_schema is null or form_schema='[]'::jsonb then t.form_schema else form_schema end,
          updated_at=now()
      where source_diagnosis_run_id=p_run_id and assignee=who and title=item_title;
      if found then mapped:=mapped+1; end if;
    end loop;
  end loop;

  with dependency_rules as (
    select i.template_code,
           min(i.depends_on_template_code) as depends_on_template_code
    from public.nexus_action_package_items i
    join public.nexus_action_packages p on p.id=i.package_id and p.active is true
    join public.nexus_action_templates child on child.code=i.template_code and child.active is true
    join public.nexus_action_templates parent on parent.code=i.depends_on_template_code and parent.active is true
    where i.depends_on_template_code is not null
    group by i.template_code
    having count(distinct i.depends_on_template_code)=1
  ), unique_parents as (
    select t.company_id,t.project_id,t.source_diagnosis_run_id,t.template_code,min(t.id) as parent_id
    from public.nexus_tasks t
    where t.source_diagnosis_run_id=p_run_id and t.template_code is not null
    group by t.company_id,t.project_id,t.source_diagnosis_run_id,t.template_code
    having count(*)=1
  )
  update public.nexus_tasks child
     set dependency_task_id=parent.parent_id,
         updated_at=now()
    from dependency_rules d,
         unique_parents parent
   where child.source_diagnosis_run_id=p_run_id
     and child.template_code=d.template_code
     and parent.source_diagnosis_run_id=p_run_id
     and parent.template_code=d.depends_on_template_code
     and parent.company_id=child.company_id
     and parent.project_id is not distinct from child.project_id
     and parent.parent_id<>child.id
     and child.dependency_task_id is distinct from parent.parent_id;
  get diagnostics dependencies_applied=row_count;

  with dependency_rules as (
    select i.template_code,
           min(i.depends_on_template_code) as depends_on_template_code
    from public.nexus_action_package_items i
    join public.nexus_action_packages p on p.id=i.package_id and p.active is true
    where i.depends_on_template_code is not null
    group by i.template_code
    having count(distinct i.depends_on_template_code)=1
  ), selected_children as (
    select distinct t.company_id,t.project_id,t.template_code
    from public.nexus_tasks t
    where t.source_diagnosis_run_id=p_run_id and t.template_code is not null
  ), parent_counts as (
    select t.company_id,t.project_id,t.template_code,count(*) as n
    from public.nexus_tasks t
    where t.source_diagnosis_run_id=p_run_id and t.template_code is not null
    group by t.company_id,t.project_id,t.template_code
  )
  select count(*)::integer into dependencies_missing
  from selected_children c
  join dependency_rules d on d.template_code=c.template_code
  left join parent_counts pc
    on pc.company_id=c.company_id
   and pc.project_id is not distinct from c.project_id
   and pc.template_code=d.depends_on_template_code
  where coalesce(pc.n,0)<>1;

  update public.nexus_diagnosis_runs
  set orchestration_summary=coalesce(orchestration_summary,'{}'::jsonb)
      ||jsonb_build_object(
          'template_mapped_actions',mapped,
          'template_dependencies_applied',dependencies_applied,
          'template_dependencies_missing',dependencies_missing
        ),
      updated_at=now()
  where id=p_run_id;
  return mapped;
end
$function$;

with rules as (
  select i.template_code,
         min(i.depends_on_template_code) as depends_on_template_code
  from public.nexus_action_package_items i
  join public.nexus_action_packages p on p.id=i.package_id and p.active is true
  where i.depends_on_template_code is not null
  group by i.template_code
  having count(distinct i.depends_on_template_code)=1
), labels as (
  select r.template_code,
         parent.title as prerequisite_title
  from rules r
  join public.nexus_action_templates parent on parent.code=r.depends_on_template_code and parent.active is true
)
update public.nexus_action_templates child
   set description=concat(
         'Prerequisite: ',labels.prerequisite_title,
         '. If accepted evidence or prior completed work already satisfies it, do not duplicate it; otherwise include it before this action. ',
         regexp_replace(coalesce(child.description,''),'^Prerequisite: .*?before this action\.\s*','','i')
       ),
       updated_at=now()
  from labels
 where child.code=labels.template_code
   and child.active is true;

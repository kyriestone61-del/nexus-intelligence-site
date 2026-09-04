-- Keep the founder-controlled resolution-selection runtime executable from the authenticated portal
-- and preserve action-contract fields when confirmed resolution recipes instantiate work.

create or replace function public.nexus_confirm_resolution_plan(p_run_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  r public.nexus_diagnosis_runs%rowtype;
  p public.nexus_resolution_proposals%rowtype;
  s record;
  tmpl public.nexus_action_templates%rowtype;
  v_prev uuid;
  v_task uuid;
  v_step_no int;
  v_selected int;
  v_total int:=0;
  v_client int:=0;
  v_nexus int:=0;
  v_approval int:=0;
  v_summary jsonb;
begin
  if not public.nexus_is_platform_admin() then raise exception 'Nexus administrator access required'; end if;
  select * into r from public.nexus_diagnosis_runs where id=p_run_id for update;
  if r.id is null then raise exception 'Diagnosis run not found'; end if;
  if r.orchestrated_at is not null then return r.orchestration_summary; end if;
  if r.status<>'approved' or r.project_id is null then raise exception 'Approve the diagnosis before confirming its resolution plan'; end if;

  select count(*) into v_selected from public.nexus_resolution_proposals where diagnosis_run_id=r.id and status='selected';
  if v_selected<1 then raise exception 'Select at least one resolution before confirming the plan'; end if;

  for p in select * from public.nexus_resolution_proposals where diagnosis_run_id=r.id and status='selected' order by opportunity_index for update loop
    perform private.nexus_validate_resolution_recipe(p.recipe);
  end loop;

  for p in select * from public.nexus_resolution_proposals where diagnosis_run_id=r.id and status='selected' order by opportunity_index for update loop
    v_prev:=null;
    v_step_no:=0;
    for s in select step,ord from jsonb_array_elements(p.recipe->'steps') with ordinality x(step,ord) order by ord loop
      v_step_no:=v_step_no+1;
      select * into tmpl from public.nexus_action_templates where code=s.step->>'template_code' and active=true;
      if tmpl.id is null then raise exception 'Resolution template disappeared during confirmation: %',s.step->>'template_code'; end if;

      select t.id into v_task from public.nexus_tasks t
      where t.source_resolution_proposal_id=p.id and t.resolution_step_key=s.step->>'key' limit 1;

      if v_task is null then
        insert into public.nexus_tasks(
          company_id,project_id,title,description,instructions,assignee,status,priority,due_date,task_type,form_schema,template_code,
          created_by,notify_client,phase,dependency_task_id,sort_order,source_diagnosis_run_id,owner_scope,
          source_resolution_proposal_id,resolution_step_key,required_evidence,completion_criteria,workflow_metadata
        ) values(
          p.company_id,p.project_id,p.title||': '||tmpl.title,
          concat_ws(E'\n\n',tmpl.description,'Resolution: '||p.title,case when p.recommendation is null then null else 'Diagnosis recommendation: '||p.recommendation end),
          tmpl.instructions,tmpl.assignee,
          case when tmpl.assignee='client' and v_prev is null then 'waiting_on_client' else 'not_started' end,
          tmpl.priority,null,tmpl.task_type,tmpl.form_schema,tmpl.code,auth.uid(),
          (tmpl.assignee='client' and v_prev is null),tmpl.phase,v_prev,p.opportunity_index*1000+v_step_no*10,r.id,tmpl.assignee,p.id,s.step->>'key',
          coalesce(tmpl.required_evidence,'[]'::jsonb),coalesce(tmpl.completion_criteria,'[]'::jsonb),coalesce(tmpl.workflow_metadata,'{}'::jsonb)
        ) returning id into v_task;
        v_total:=v_total+1;
        if tmpl.assignee='client' then v_client:=v_client+1; else v_nexus:=v_nexus+1; end if;
        if tmpl.task_type in ('approval','decision','review') then v_approval:=v_approval+1; end if;
      end if;
      v_prev:=v_task;
    end loop;

    update public.nexus_resolution_proposals
    set status='confirmed',confirmed_at=now(),updated_at=now()
    where id=p.id;
  end loop;

  update public.nexus_projects
  set status='active',engagement_stage='build_test',updated_at=now()
  where id=r.project_id;

  v_summary:=jsonb_build_object(
    'projects',1,
    'opportunities',(select count(*) from public.nexus_opportunities where source_diagnosis_run_id=r.id),
    'metrics',(select count(*) from public.nexus_metrics where source_diagnosis_run_id=r.id),
    'resolution_proposals',(select count(*) from public.nexus_resolution_proposals where diagnosis_run_id=r.id),
    'selected_resolutions',v_selected,'confirmed_resolutions',v_selected,
    'tasks',v_total,'nexus_tasks',v_nexus,'client_actions',v_client,'approval_actions',v_approval,
    'document_requests',0,'approvals',v_approval,'milestones',0,
    'plan_status','confirmed','project_id',r.project_id
  );

  update public.nexus_diagnosis_runs
  set orchestrated_at=now(),orchestration_summary=v_summary,updated_at=now()
  where id=r.id;

  insert into public.nexus_activity_log(company_id,actor_id,action,entity_type,entity_id,summary)
  values(r.company_id,auth.uid(),'resolution_plan_confirmed','diagnosis_run',r.id,
    'Confirmed '||v_selected||' founder-selected resolution(s) and instantiated only their governed execution chains.');

  return v_summary;
end
$function$;

revoke execute on function public.nexus_get_resolution_plan(uuid) from public, anon;
revoke execute on function public.nexus_set_resolution_selection(uuid,text,jsonb) from public, anon;
revoke execute on function public.nexus_confirm_resolution_plan(uuid) from public, anon;
grant execute on function public.nexus_get_resolution_plan(uuid) to authenticated;
grant execute on function public.nexus_set_resolution_selection(uuid,text,jsonb) to authenticated;
grant execute on function public.nexus_confirm_resolution_plan(uuid) to authenticated;

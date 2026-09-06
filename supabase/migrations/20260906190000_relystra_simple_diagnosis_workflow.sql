-- RELYSTRA simplified diagnosis-led operating model.
-- Source-control mirror of the production migrations applied on 2026-09-06.
-- Goal: two ordered intake steps -> diagnosis -> one approved plan -> one four-step delivery workflow.

insert into public.nexus_action_templates(
  code,category,title,description,instructions,assignee,priority,task_type,form_schema,active,sort_order,phase,required_evidence,completion_criteria,workflow_metadata
) values
(
  'simple_discovery_context','Discovery','Tell us about the business',
  'Answer a few basics so Relystra understands the business and the workflow before the diagnosis.',
  'Use plain language. If something is unknown, write "I don''t know" instead of guessing.',
  'client','high','discovery_information_request',
  '[{"key":"business_summary","label":"What does the business do?","type":"textarea","required":true},{"key":"workflow_focus","label":"What process do you want Relystra to understand or improve?","type":"textarea","required":true},{"key":"people","label":"Who handles this work today?","type":"textarea","required":false},{"key":"systems","label":"What tools or systems are used?","type":"textarea","required":false},{"key":"success","label":"What would a better result look like?","type":"textarea","required":true}]'::jsonb,
  true,10,'discovery',
  '[{"kind":"response","label":"Answer the business and workflow questions","required":true}]'::jsonb,
  '["The required questions are answered","Relystra can understand the workflow without guessing"]'::jsonb,
  '{"simple_flow":true,"step_label":"1 of 2"}'::jsonb
),
(
  'simple_current_workflow','Discovery','Show us how the work happens today',
  'Upload one or two examples that show the current process. Rough files are fine.',
  'Useful examples include a screenshot, spreadsheet, report, form, checklist, SOP, or sample output. Do not upload passwords, MFA codes, API keys, or unrelated sensitive information.',
  'client','high','workflow_evidence','[]'::jsonb,true,20,'discovery',
  '[{"kind":"file","label":"One or more examples of the current workflow","required":true}]'::jsonb,
  '["At least one useful current-state example is attached","The file has enough context for Relystra to review it"]'::jsonb,
  '{"simple_flow":true,"step_label":"2 of 2"}'::jsonb
),
(
  'simple_prepare_build','Delivery','Prepare for the build',
  'Confirm the approved plan and provide any files, access, or answers Relystra needs to begin.',
  'Approve the plan or explain what needs to change. Share only what the approved plan requires. Use secure access methods and never paste passwords, MFA codes, API keys, or payment-card data into the portal.',
  'client','high','structured_form',
  '[{"key":"plan_decision","label":"Is the plan clear and approved?","type":"select","required":true,"options":["Approved","I need a change"]},{"key":"prep_note","label":"What have you provided, or what needs to change?","type":"textarea","required":true}]'::jsonb,
  true,10,'delivery',
  '[{"kind":"response","label":"Plan decision and preparation note","required":true}]'::jsonb,
  '["The client has approved the plan or clearly requested a change","Required preparation information is available or the remaining need is explicit"]'::jsonb,
  '{"simple_flow":true,"delivery_step":1}'::jsonb
),
(
  'simple_build_test','Delivery','Build and test the solution',
  'Relystra builds the approved solution and tests it before handing it back for review.',
  'Build only the approved scope. Test the normal path, important edge cases, permissions, and fallback behavior. Record the result and any remaining limitation.',
  'nexus','high','nexus_internal','[]'::jsonb,true,20,'delivery',
  '[{"kind":"internal","label":"Build and test evidence","required":true}]'::jsonb,
  '["The approved solution is built","Testing is complete","Known limitations and the review-ready result are documented"]'::jsonb,
  '{"simple_flow":true,"delivery_step":2}'::jsonb
),
(
  'simple_review_result','Delivery','Review the result',
  'Try the completed work and tell Relystra whether it is ready or needs a change.',
  'Review the delivered result against the approved plan. Choose Approved if it works as expected, or request a change and explain what is wrong.',
  'client','high','review',
  '[{"key":"review_decision","label":"What is your decision?","type":"select","required":true,"options":["Approved","Needs a change"]},{"key":"feedback","label":"Feedback or requested change","type":"textarea","required":false}]'::jsonb,
  true,30,'delivery',
  '[{"kind":"response","label":"Client review decision","required":true}]'::jsonb,
  '["The client has reviewed the delivered result","Approval or requested changes are clearly documented"]'::jsonb,
  '{"simple_flow":true,"delivery_step":3}'::jsonb
),
(
  'simple_finish_measure','Delivery','Finish and measure',
  'Relystra completes the handoff and records what changed, what was delivered, and what should be measured next.',
  'Resolve any approved final changes, document the handoff and fallback, and record the baseline/result measurement that is actually supported by evidence.',
  'nexus','high','nexus_internal','[]'::jsonb,true,40,'delivery',
  '[{"kind":"internal","label":"Final handoff and measurement record","required":true}]'::jsonb,
  '["The final handoff is documented","Any supported result measurement is recorded","The engagement has a clear closeout or next step"]'::jsonb,
  '{"simple_flow":true,"delivery_step":4}'::jsonb
)
on conflict(code) do update set
  category=excluded.category,title=excluded.title,description=excluded.description,instructions=excluded.instructions,
  assignee=excluded.assignee,priority=excluded.priority,task_type=excluded.task_type,form_schema=excluded.form_schema,
  active=true,sort_order=excluded.sort_order,phase=excluded.phase,required_evidence=excluded.required_evidence,
  completion_criteria=excluded.completion_criteria,workflow_metadata=excluded.workflow_metadata,updated_at=now();

insert into public.nexus_resolution_catalog(code,title,category,description,match_terms,default_recipe,version,active,updated_at)
values(
  'diagnosis_single_workflow','Recommended Relystra plan','Delivery',
  'One diagnosis-led delivery workflow with four plain-language steps.',
  array['diagnosis','recommended','first intervention','pilot'],
  '{"steps":[{"key":"prepare","template_code":"simple_prepare_build"},{"key":"build","template_code":"simple_build_test"},{"key":"review","template_code":"simple_review_result"},{"key":"finish","template_code":"simple_finish_measure"}]}'::jsonb,
  1,true,now()
)
on conflict(code) do update set title=excluded.title,category=excluded.category,description=excluded.description,match_terms=excluded.match_terms,default_recipe=excluded.default_recipe,version=excluded.version,active=true,updated_at=now();

create or replace function private.nexus_initialize_intake_project()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_first uuid;
  v_template public.nexus_action_templates%rowtype;
  m record;
begin
  if new.service_slug is distinct from 'ai-opportunity-assessment' then return new; end if;
  if tg_op='UPDATE' and old.service_slug is not distinct from new.service_slug then return new; end if;

  select * into v_template from public.nexus_action_templates where code='simple_discovery_context' and active=true;
  insert into public.nexus_tasks(
    company_id,project_id,title,description,instructions,assignee,status,priority,task_type,form_schema,template_code,
    created_by,notify_client,phase,sort_order,owner_scope,required_evidence,completion_criteria,workflow_metadata
  ) values(
    new.company_id,new.id,v_template.title,v_template.description,v_template.instructions,v_template.assignee,'waiting_on_client',
    v_template.priority,v_template.task_type,v_template.form_schema,v_template.code,new.created_by,true,v_template.phase,10,'client',
    v_template.required_evidence,v_template.completion_criteria,v_template.workflow_metadata
  ) returning id into v_first;

  select * into v_template from public.nexus_action_templates where code='simple_current_workflow' and active=true;
  insert into public.nexus_tasks(
    company_id,project_id,title,description,instructions,assignee,status,priority,task_type,form_schema,template_code,
    created_by,notify_client,phase,dependency_task_id,sort_order,owner_scope,required_evidence,completion_criteria,workflow_metadata
  ) values(
    new.company_id,new.id,v_template.title,v_template.description,v_template.instructions,v_template.assignee,'not_started',
    v_template.priority,v_template.task_type,v_template.form_schema,v_template.code,new.created_by,false,v_template.phase,v_first,20,'client',
    v_template.required_evidence,v_template.completion_criteria,v_template.workflow_metadata
  );

  for m in select cm.user_id from public.nexus_company_members cm where cm.company_id=new.company_id and cm.active is true loop
    insert into public.nexus_notifications(company_id,user_id,notification_type,title,message,related_type,related_id,created_by,action_url)
    values(new.company_id,m.user_id,'next_step','Your Relystra workspace is ready',
      'Start with “Tell us about the business.” Relystra will show the next step only when it is ready.',
      'project',new.id,new.created_by,'/portal')
    on conflict do nothing;
  end loop;
  return new;
end
$function$;

create or replace function public.nexus_approve_diagnosis(p_run_id uuid, p_note text default null::text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  r public.nexus_diagnosis_runs%rowtype;
  res jsonb;
  pilot jsonb;
  plan jsonb;
  proj uuid;
  rec record;
  item jsonb;
  v_opp uuid;
  v_recipe jsonb;
  v_catalog_title text;
  v_opp_count int:=0;
  v_metric_count int:=0;
  v_summary jsonb;
begin
  if not public.nexus_is_platform_admin() then raise exception 'Relystra administrator access required'; end if;
  select * into r from public.nexus_diagnosis_runs where id=p_run_id for update;
  if r.id is null then raise exception 'Diagnosis run not found'; end if;
  if r.analysis_result is null then raise exception 'Diagnosis has no analysis result'; end if;
  if r.status not in ('ready_for_review','approved') then raise exception 'Diagnosis must be ready for review before approval'; end if;

  if r.orchestrated_at is not null then
    update public.nexus_diagnosis_runs set status='approved',approved_at=coalesce(approved_at,now()),approved_by=coalesce(approved_by,auth.uid()),review_notes=coalesce(nullif(trim(coalesce(p_note,'')),''),review_notes),updated_at=now() where id=r.id;
    return r.orchestration_summary;
  end if;

  res:=r.analysis_result;
  pilot:=coalesce(res->'smallest_safe_pilot','{}'::jsonb);
  plan:=coalesce(res->'recommended_first_intervention',pilot,'{}'::jsonb);

  insert into public.nexus_projects(company_id,name,service_type,status,summary,created_by,source_diagnosis_run_id,project_type,engagement_stage,owner_scope)
  values(r.company_id,coalesce(nullif(plan->>'title',''),nullif(pilot->>'title',''),'Diagnosis-led delivery plan'),'Implementation Sprint','planning',coalesce(plan->>'summary',pilot->>'summary','Approved diagnosis awaiting plan confirmation'),auth.uid(),r.id,'diagnosis_pilot','diagnosis','nexus')
  on conflict (source_diagnosis_run_id) where source_diagnosis_run_id is not null
  do update set name=excluded.name,summary=excluded.summary,updated_at=now()
  returning id into proj;

  for rec in select value as item, ordinality::int as idx from jsonb_array_elements(coalesce(res->'opportunity_backlog','[]'::jsonb)) with ordinality loop
    insert into public.nexus_opportunities(company_id,project_id,title,problem,source,status,value_score,effort_score,readiness_score,recommendation,created_by,source_diagnosis_run_id)
    values(r.company_id,proj,coalesce(nullif(rec.item->>'title',''),'Opportunity'),rec.item->>'problem','diagnosis','backlog',nullif(rec.item->>'value_score','')::smallint,nullif(rec.item->>'effort_score','')::smallint,nullif(rec.item->>'readiness_score','')::smallint,rec.item->>'recommendation',auth.uid(),r.id)
    on conflict (source_diagnosis_run_id,title) where source_diagnosis_run_id is not null do nothing;
  end loop;

  select o.id into v_opp from public.nexus_opportunities o where o.source_diagnosis_run_id=r.id order by coalesce(o.readiness_score,0) desc,coalesce(o.value_score,0) desc,o.created_at limit 1;
  select c.default_recipe,c.title into v_recipe,v_catalog_title from public.nexus_resolution_catalog c where c.code='diagnosis_single_workflow' and c.active=true;
  perform private.nexus_validate_resolution_recipe(v_recipe);

  delete from public.nexus_resolution_proposals where diagnosis_run_id=r.id;
  insert into public.nexus_resolution_proposals(diagnosis_run_id,company_id,project_id,opportunity_id,opportunity_index,resolution_code,title,problem,recommendation,match_reason,evidence,recipe,status,selected_by,selected_at)
  values(r.id,r.company_id,proj,v_opp,1,'diagnosis_single_workflow',coalesce(nullif(plan->>'title',''),v_catalog_title,'Recommended Relystra plan'),coalesce(plan->>'why_first',plan->>'summary',pilot->>'summary'),coalesce(plan->>'summary',pilot->>'summary'),'The diagnosis identified one recommended first intervention. Relystra converts it into one simple delivery workflow.',jsonb_build_object('source','diagnosis','recommended_first_intervention',plan,'smallest_safe_pilot',pilot),v_recipe,'selected',auth.uid(),now());

  for item in select * from jsonb_array_elements(coalesce(res->'baseline_measurements','[]'::jsonb)) loop
    insert into public.nexus_metrics(company_id,project_id,name,unit,baseline_value,measurement_method,notes,created_by,evidence,confidence,metric_type,source_diagnosis_run_id)
    values(r.company_id,proj,coalesce(nullif(item->>'name',''),'Baseline metric'),item->>'unit',private.nexus_try_numeric(item->'baseline_value'),item->>'measurement_method',case when item ? 'baseline_value' and private.nexus_try_numeric(item->'baseline_value') is null and nullif(btrim(item->>'baseline_value'),'') is not null then concat_ws(E'\n',nullif(item->>'notes',''),concat('Qualitative baseline: ',item->>'baseline_value')) else item->>'notes' end,auth.uid(),item->>'evidence',coalesce(nullif(item->>'confidence',''),'unrated'),'baseline',r.id)
    on conflict (source_diagnosis_run_id,name) where source_diagnosis_run_id is not null do nothing;
  end loop;

  update public.nexus_active_engagements set project_id=proj,updated_by=auth.uid(),updated_at=now() where company_id=r.company_id;
  if not found then insert into public.nexus_active_engagements(company_id,project_id,updated_by,updated_at) values(r.company_id,proj,auth.uid(),now()); end if;

  select count(*) into v_opp_count from public.nexus_opportunities where source_diagnosis_run_id=r.id;
  select count(*) into v_metric_count from public.nexus_metrics where source_diagnosis_run_id=r.id;
  v_summary:=jsonb_build_object('projects',1,'opportunities',v_opp_count,'metrics',v_metric_count,'resolution_proposals',1,'selected_resolutions',1,'milestones',0,'nexus_tasks',0,'client_actions',0,'document_requests',0,'approvals',0,'plan_status','ready_to_confirm','project_id',proj,'one_workflow',true);
  update public.nexus_diagnosis_runs set project_id=proj,status='approved',approved_at=coalesce(approved_at,now()),approved_by=coalesce(approved_by,auth.uid()),review_notes=coalesce(nullif(trim(coalesce(p_note,'')),''),review_notes),orchestration_summary=v_summary,updated_at=now() where id=r.id;
  insert into public.nexus_activity_log(company_id,actor_id,action,entity_type,entity_id,summary) values(r.company_id,auth.uid(),'diagnosis_approved_for_single_plan','diagnosis_run',r.id,'Diagnosis approved. One recommended delivery plan is ready for confirmation; no parallel action chains were created.');
  return v_summary;
end
$function$;

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
  v_step_no int:=0;
  v_selected int;
  v_total int:=0;
  v_client int:=0;
  v_nexus int:=0;
  v_approval int:=0;
  v_summary jsonb;
begin
  if not public.nexus_is_platform_admin() then raise exception 'Relystra administrator access required'; end if;
  select * into r from public.nexus_diagnosis_runs where id=p_run_id for update;
  if r.id is null then raise exception 'Diagnosis run not found'; end if;
  if r.orchestrated_at is not null then return r.orchestration_summary; end if;
  if r.status<>'approved' or r.project_id is null then raise exception 'Approve the diagnosis before confirming its plan'; end if;
  select count(*) into v_selected from public.nexus_resolution_proposals where diagnosis_run_id=r.id and status='selected';
  if v_selected<>1 then raise exception 'Relystra requires exactly one diagnosis-led plan'; end if;
  select * into p from public.nexus_resolution_proposals where diagnosis_run_id=r.id and status='selected' order by opportunity_index limit 1 for update;
  perform private.nexus_validate_resolution_recipe(p.recipe);

  v_prev:=null;
  for s in select step,ord from jsonb_array_elements(p.recipe->'steps') with ordinality x(step,ord) order by ord loop
    v_step_no:=v_step_no+1;
    select * into tmpl from public.nexus_action_templates where code=s.step->>'template_code' and active=true;
    if tmpl.id is null then raise exception 'Delivery template is unavailable: %',s.step->>'template_code'; end if;
    select t.id into v_task from public.nexus_tasks t where t.source_resolution_proposal_id=p.id and t.resolution_step_key=s.step->>'key' limit 1;
    if v_task is null then
      insert into public.nexus_tasks(company_id,project_id,title,description,instructions,assignee,status,priority,due_date,task_type,form_schema,template_code,created_by,notify_client,phase,dependency_task_id,sort_order,source_diagnosis_run_id,owner_scope,source_resolution_proposal_id,resolution_step_key,required_evidence,completion_criteria,workflow_metadata)
      values(p.company_id,p.project_id,tmpl.title,tmpl.description,tmpl.instructions,tmpl.assignee,case when tmpl.assignee='client' and v_prev is null then 'waiting_on_client' else 'not_started' end,tmpl.priority,null,tmpl.task_type,tmpl.form_schema,tmpl.code,auth.uid(),(tmpl.assignee='client' and v_prev is null),tmpl.phase,v_prev,v_step_no*10,r.id,tmpl.assignee,p.id,s.step->>'key',coalesce(tmpl.required_evidence,'[]'::jsonb),coalesce(tmpl.completion_criteria,'[]'::jsonb),coalesce(tmpl.workflow_metadata,'{}'::jsonb)||jsonb_build_object('diagnosis_plan_title',p.title,'one_workflow',true)) returning id into v_task;
      v_total:=v_total+1;
      if tmpl.assignee='client' then v_client:=v_client+1; else v_nexus:=v_nexus+1; end if;
      if tmpl.task_type in ('approval','decision','review') then v_approval:=v_approval+1; end if;
    end if;
    v_prev:=v_task;
  end loop;

  update public.nexus_resolution_proposals set status='confirmed',confirmed_at=now(),updated_at=now() where id=p.id;
  update public.nexus_projects set status='active',engagement_stage='build_test',updated_at=now() where id=r.project_id;
  v_summary:=jsonb_build_object('projects',1,'opportunities',(select count(*) from public.nexus_opportunities where source_diagnosis_run_id=r.id),'metrics',(select count(*) from public.nexus_metrics where source_diagnosis_run_id=r.id),'resolution_proposals',1,'selected_resolutions',1,'confirmed_resolutions',1,'tasks',v_total,'nexus_tasks',v_nexus,'client_actions',v_client,'approval_actions',v_approval,'document_requests',0,'approvals',v_approval,'milestones',0,'plan_status','confirmed','project_id',r.project_id,'one_workflow',true);
  update public.nexus_diagnosis_runs set orchestrated_at=now(),orchestration_summary=v_summary,updated_at=now() where id=r.id;
  insert into public.nexus_activity_log(company_id,actor_id,action,entity_type,entity_id,summary) values(r.company_id,auth.uid(),'single_delivery_plan_confirmed','diagnosis_run',r.id,'Confirmed the diagnosis-led plan and created one four-step delivery workflow.');
  return v_summary;
end
$function$;

create or replace function public.nexus_phase_zero_confirm_resolution_plan(p_run_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare v_summary jsonb; v_project_id uuid; v_company_id uuid;
begin
  if not public.nexus_is_platform_admin() then raise exception 'Relystra administrator access required'; end if;
  v_summary:=public.nexus_confirm_resolution_plan(p_run_id);
  select project_id,company_id into v_project_id,v_company_id from public.nexus_diagnosis_runs where id=p_run_id;
  if v_project_id is null then raise exception 'Confirmed plan did not produce a project'; end if;
  update public.nexus_tasks set status='not_started',notify_client=false,updated_at=now() where project_id=v_project_id and archived_at is null and source_diagnosis_run_id=p_run_id and status not in ('completed','approved','done','not_applicable','cancelled','canceled');
  perform set_config('nexus.stage_override_reason','Phase Zero commercial gate normalization',true);
  update public.nexus_projects set engagement_stage='commercial',status='planning',client_status_update='Plan confirmed. Relystra will start the four-step delivery workflow after scope and payment are confirmed.',client_status_updated_at=now(),client_status_updated_by=auth.uid(),updated_at=now() where id=v_project_id;
  v_summary:=coalesce(v_summary,'{}'::jsonb)||jsonb_build_object('plan_status','commercial_gate','project_id',v_project_id,'implementation_released',false,'required_gates',jsonb_build_array('scope_signed','payment_confirmed'),'one_workflow',true);
  update public.nexus_diagnosis_runs set orchestration_summary=v_summary,updated_at=now() where id=p_run_id;
  insert into public.nexus_activity_log(company_id,actor_id,action,entity_type,entity_id,summary) values(v_company_id,auth.uid(),'phase_zero_commercial_gate_opened','project',v_project_id,'Diagnosis-led plan confirmed. The simple delivery workflow remains paused until scope and payment are confirmed.');
  return v_summary;
end
$function$;

create or replace function private.nexus_enforce_task_dependency_order()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare v_dep_status text;
begin
  if new.status is not distinct from old.status then return new; end if;
  if new.dependency_task_id is null then return new; end if;
  if lower(coalesce(new.status,'')) not in ('in_progress','ready_for_review','submitted','completed','approved','done') then return new; end if;
  select lower(coalesce(status,'')) into v_dep_status from public.nexus_tasks where id=new.dependency_task_id;
  if v_dep_status is null then raise exception 'The previous workflow step is missing'; end if;
  if v_dep_status not in ('completed','approved','done','not_applicable','cancelled','canceled') then raise exception 'Finish the previous workflow step before starting this one'; end if;
  return new;
end
$function$;

drop trigger if exists nexus_enforce_task_dependency_order on public.nexus_tasks;
create trigger nexus_enforce_task_dependency_order before update of status on public.nexus_tasks for each row execute function private.nexus_enforce_task_dependency_order();

create or replace function private.nexus_activate_resolution_dependents()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if new.status in ('approved','completed','done','not_applicable') and old.status is distinct from new.status then
    update public.nexus_tasks d
    set status=case when d.assignee='client' then 'waiting_on_client' else d.status end,
        notify_client=case when d.assignee='client' then true else d.notify_client end,
        updated_at=now()
    where d.dependency_task_id=new.id and d.assignee='client' and d.notify_client=false and d.status in ('draft','not_started')
      and (d.source_resolution_proposal_id is not null or coalesce(d.workflow_metadata->>'simple_flow','false')='true' or coalesce(d.workflow_metadata->>'one_workflow','false')='true');
  end if;
  return new;
end
$function$;

create or replace function private.nexus_notify_client_on_task()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare m record;
begin
  if new.assignee <> 'client' or new.notify_client is false or new.status='draft' then return new; end if;
  if not exists (select 1 from private.nexus_client_action_context_unchecked(new.company_id) ctx where ctx.task_id=new.id and ctx.canonical_state='WAITING_ON_YOU') then return new; end if;
  if tg_op='UPDATE' then
    if not ((old.status='draft' and new.status<>'draft') or (old.notify_client is false and new.notify_client is true)) then return new; end if;
  end if;
  for m in select cm.user_id from public.nexus_company_members cm where cm.company_id=new.company_id and cm.active is true loop
    if not exists (select 1 from public.nexus_notifications n where n.user_id=m.user_id and n.related_type='task' and n.related_id=new.id) then
      insert into public.nexus_notifications(company_id,user_id,notification_type,title,message,related_type,related_id,created_by,action_url)
      values(new.company_id,m.user_id,'task','New Relystra action: '||new.title,coalesce(new.description,'A new action item is ready in your Relystra workspace.'),'task',new.id,new.created_by,'/portal');
    end if;
    perform private.nexus_enqueue_member_email(m.user_id,new.company_id,'task','New Relystra action: '||new.title,coalesce(new.description,'A new action item is ready in your Relystra workspace.')||case when new.due_date is not null then ' Due: '||new.due_date::text||'.' else '' end,'/portal','task',new.id,'task:'||new.id::text||':'||m.user_id::text,jsonb_build_object('due_date',new.due_date,'priority',new.priority,'canonical_state','WAITING_ON_YOU'));
  end loop;
  return new;
end
$function$;

create or replace function private.nexus_notify_newly_unblocked_client_tasks()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  t record; m record;
  old_complete boolean := lower(coalesce(old.status,'')) in ('complete','completed','done','resolved','approved','released','implemented','closed');
  new_complete boolean := lower(coalesce(new.status,'')) in ('complete','completed','done','resolved','approved','released','implemented','closed');
begin
  if old_complete or not new_complete then return new; end if;
  for t in select task.* from public.nexus_tasks task join private.nexus_client_action_context_unchecked(new.company_id) ctx on ctx.task_id=task.id where task.company_id=new.company_id and task.assignee='client' and task.notify_client is true and ctx.canonical_state='WAITING_ON_YOU' loop
    for m in select cm.user_id from public.nexus_company_members cm where cm.company_id=t.company_id and cm.active is true loop
      if not exists (select 1 from public.nexus_notifications n where n.user_id=m.user_id and n.related_type='task' and n.related_id=t.id) then
        insert into public.nexus_notifications(company_id,user_id,notification_type,title,message,related_type,related_id,created_by,action_url)
        values(t.company_id,m.user_id,'task','New Relystra action: '||t.title,coalesce(t.description,'A new action item is now ready in your Relystra workspace.'),'task',t.id,t.created_by,'/portal');
        perform private.nexus_enqueue_member_email(m.user_id,t.company_id,'task','New Relystra action: '||t.title,coalesce(t.description,'A new action item is now ready in your Relystra workspace.')||case when t.due_date is not null then ' Due: '||t.due_date::text||'.' else '' end,'/portal','task',t.id,'task:'||t.id::text||':'||m.user_id::text,jsonb_build_object('due_date',t.due_date,'priority',t.priority,'canonical_state','WAITING_ON_YOU','released_by_dependency',new.id));
      end if;
    end loop;
  end loop;
  return new;
end
$function$;

create or replace function public.nexus_approve_task(p_task_id uuid, p_note text default null::text)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare v public.nexus_tasks%rowtype; m record;
begin
  if not public.nexus_is_platform_admin() then raise exception 'Relystra administrator access required'; end if;
  select * into v from public.nexus_tasks where id=p_task_id for update;
  if v.id is null then raise exception 'Task not found'; end if;
  if v.archived_at is not null then raise exception 'Archived actions cannot be approved'; end if;
  if v.status <> 'ready_for_review' then raise exception 'Task is not ready for review'; end if;
  update public.nexus_tasks set status='completed',assignee='nexus',owner_scope='nexus',review_note=nullif(trim(coalesce(p_note,'')),''),reviewed_at=now(),completed_at=now(),updated_at=now() where id=p_task_id;
  for m in select user_id from public.nexus_company_members where company_id=v.company_id and active is true loop
    insert into public.nexus_notifications(company_id,user_id,notification_type,title,message,related_type,related_id,created_by,action_url)
    values(v.company_id,m.user_id,'task_approved','Step approved: '||v.title,'Relystra reviewed and completed this step.','task',v.id,auth.uid(),'/portal');
  end loop;
  insert into public.nexus_activity_log(company_id,actor_id,action,entity_type,entity_id,summary) values(v.company_id,auth.uid(),'task_approved','task',v.id,'Relystra approved step: '||v.title);
  return v.id;
end
$function$;

create or replace function public.nexus_submit_task_for_review(p_task_id uuid, p_response_data jsonb default null::jsonb)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare v public.nexus_tasks%rowtype; a record;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v from public.nexus_tasks where id=p_task_id for update;
  if v.id is null then raise exception 'Task not found'; end if;
  if v.archived_at is not null then raise exception 'Archived actions cannot be submitted'; end if;
  if not public.nexus_is_company_member(v.company_id) then raise exception 'Company membership required'; end if;
  if v.assignee <> 'client' then raise exception 'This step is not assigned to the client'; end if;
  if not v.notify_client then raise exception 'This step is not ready yet'; end if;
  if v.status not in ('waiting_on_client','not_started','open','in_progress','needs_revision') then raise exception 'This step is not currently actionable'; end if;
  if v.dependency_task_id is not null and not exists(select 1 from public.nexus_tasks d where d.id=v.dependency_task_id and d.status in ('approved','completed','done','not_applicable') and d.archived_at is null) then raise exception 'Finish the previous step first'; end if;
  update public.nexus_tasks set response_data=coalesce(p_response_data,response_data),response_updated_at=case when p_response_data is null then response_updated_at else now() end,status='ready_for_review',assignee='nexus',owner_scope='nexus',submitted_at=now(),review_note=null,workflow_metadata=coalesce(workflow_metadata,'{}'::jsonb)-'help_requested',updated_at=now() where id=p_task_id;
  for a in select user_id from public.nexus_platform_admins loop
    insert into public.nexus_notifications(company_id,user_id,notification_type,title,message,related_type,related_id,created_by,action_url)
    values(v.company_id,a.user_id,'task_review','Step ready for review: '||v.title,'A client step was submitted and is ready for Relystra review.','task',v.id,auth.uid(),'/portal');
  end loop;
  insert into public.nexus_activity_log(company_id,actor_id,action,entity_type,entity_id,summary) values(v.company_id,auth.uid(),'task_submitted','task',v.id,'Client submitted step for Relystra review: '||v.title);
  return v.id;
end
$function$;

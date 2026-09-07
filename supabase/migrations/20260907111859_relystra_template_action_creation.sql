-- Add contextual actions without rewriting an approved diagnosis or creating a Project.
begin;
create or replace function private.relystra_create_template_action(p_company_id uuid,p_run_id uuid,p_source_path text,p_template_code text,p_request_id uuid,p_patch jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare r public.nexus_diagnosis_runs%rowtype; t public.nexus_action_templates%rowtype;
  source jsonb; party text; action_id uuid; source_key text;
begin
  if auth.uid() is null or not public.nexus_is_platform_admin() then raise exception 'Relystra administrator access required'; end if;
  if p_request_id is null or jsonb_typeof(p_patch) is distinct from 'object' then raise exception 'A request ID and action details are required'; end if;
  select * into r from public.nexus_diagnosis_runs where id=p_run_id and company_id=p_company_id for update;
  if r.id is null or r.status<>'approved' then raise exception 'Choose an approved diagnosis for this company'; end if;
  if p_source_path is null or p_source_path !~ '^(client_action_items|nexus_actions)/[0-9]{1,4}$' then raise exception 'Choose a diagnosis source action'; end if;
  source:=r.analysis_result #> string_to_array(p_source_path,'/');
  if jsonb_typeof(source) is distinct from 'object' or nullif(btrim(source->>'title'),'') is null then raise exception 'Diagnosis source action not found'; end if;
  select * into t from public.nexus_action_templates where code=p_template_code and active and workflow_metadata->>'work_kind'='prebuild_action';
  if t.id is null then raise exception 'Choose an active pre-build action template'; end if;
  party:=coalesce(p_patch->>'responsible_party',t.workflow_metadata->>'responsible_party');
  if party not in ('client','admin','ai') or party is null then raise exception 'Choose Client, Admin, or AI'; end if;
  if nullif(btrim(p_patch->>'title'),'') is null or nullif(btrim(p_patch->>'instructions'),'') is null then raise exception 'An action needs a title and clear instructions'; end if;
  source_key:='template/'||p_request_id::text;
  select id into action_id from public.nexus_tasks where source_diagnosis_run_id=r.id and resolution_step_key=source_key and work_kind='prebuild_action';
  if action_id is not null then return action_id; end if;
  insert into public.nexus_tasks(company_id,project_id,title,description,instructions,assignee,owner_scope,status,priority,
    task_type,form_schema,required_evidence,completion_criteria,template_code,phase,notify_client,created_by,
    work_kind,responsible_party,action_review_state,source_diagnosis_run_id,resolution_step_key,source_finding_refs,workflow_metadata,due_date)
  values(r.company_id,null,btrim(p_patch->>'title'),coalesce(p_patch->>'description',t.description),btrim(p_patch->>'instructions'),
    case when party='client' then 'client' else 'nexus' end,case when party='client' then 'client' else 'nexus' end,'draft','normal',
    t.task_type,t.form_schema,t.required_evidence,t.completion_criteria,t.code,'prebuild',false,auth.uid(),
    'prebuild_action',party,'suggested',r.id,source_key,
    jsonb_build_array(jsonb_build_object('ref',r.id::text||':'||p_source_path||':'||md5(source::text),'diagnosis_run_id',r.id,
      'path',p_source_path,'analyzed_at',r.analysis_completed_at,'snapshot',source)),
    jsonb_build_object('delivery_version',2,'source','admin_template','request_id',p_request_id),nullif(p_patch->>'due_date','')::date)
  returning id into action_id;
  insert into public.nexus_activity_log(company_id,actor_id,action,entity_type,entity_id,summary)
    values(r.company_id,auth.uid(),'prebuild_action_created','task',action_id,'Suggested action from template: '||btrim(p_patch->>'title'));
  return action_id;
end $$;
create or replace function public.relystra_create_template_action(p_company_id uuid,p_run_id uuid,p_source_path text,p_template_code text,p_request_id uuid,p_patch jsonb)
returns uuid language sql security invoker set search_path='' as $$
  select private.relystra_create_template_action(p_company_id,p_run_id,p_source_path,p_template_code,p_request_id,p_patch)
$$;
revoke all on function private.relystra_create_template_action(uuid,uuid,text,text,uuid,jsonb),public.relystra_create_template_action(uuid,uuid,text,text,uuid,jsonb) from public,anon;
grant execute on function private.relystra_create_template_action(uuid,uuid,text,text,uuid,jsonb),public.relystra_create_template_action(uuid,uuid,text,text,uuid,jsonb) to authenticated;
commit;

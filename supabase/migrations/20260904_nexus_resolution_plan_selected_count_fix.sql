create or replace function public.nexus_get_resolution_plan(p_run_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  r public.nexus_diagnosis_runs%rowtype;
  v_items jsonb;
  v_selected int;
  v_total int;
  v_can_confirm boolean;
begin
  if not public.nexus_is_platform_admin() then raise exception 'Nexus administrator access required'; end if;
  select * into r from public.nexus_diagnosis_runs where id=p_run_id;
  if r.id is null then raise exception 'Diagnosis run not found'; end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id',p.id,'opportunity_index',p.opportunity_index,'resolution_code',p.resolution_code,'title',p.title,
      'problem',p.problem,'recommendation',p.recommendation,'match_reason',p.match_reason,'evidence',p.evidence,
      'status',p.status,'founder_note',p.founder_note,'selected_at',p.selected_at,'confirmed_at',p.confirmed_at,
      'steps',coalesce((
        select jsonb_agg(jsonb_build_object(
          'key',s.step->>'key','template_code',s.step->>'template_code','title',t.title,'description',t.description,
          'assignee',t.assignee,'task_type',t.task_type,'phase',t.phase,'priority',t.priority
        ) order by s.ord)
        from jsonb_array_elements(p.recipe->'steps') with ordinality s(step,ord)
        join public.nexus_action_templates t on t.code=s.step->>'template_code' and t.active=true
      ),'[]'::jsonb)
    ) order by p.opportunity_index
  ),'[]'::jsonb),
  count(*) filter(where p.status in ('selected','confirmed'))::int,
  count(*)::int,
  count(*) filter(where p.status='selected') > 0
  into v_items,v_selected,v_total,v_can_confirm
  from public.nexus_resolution_proposals p
  where p.diagnosis_run_id=r.id;

  return jsonb_build_object(
    'diagnosis_run_id',r.id,'project_id',r.project_id,'diagnosis_status',r.status,
    'plan_status',case when r.orchestrated_at is not null then 'confirmed' when v_can_confirm then 'selection_in_progress' else 'awaiting_selection' end,
    'selected_count',v_selected,'proposal_count',v_total,'can_confirm',(r.status='approved' and r.orchestrated_at is null and v_can_confirm),
    'proposals',v_items
  );
end
$function$;

revoke execute on function public.nexus_get_resolution_plan(uuid) from public,anon;
grant execute on function public.nexus_get_resolution_plan(uuid) to authenticated;

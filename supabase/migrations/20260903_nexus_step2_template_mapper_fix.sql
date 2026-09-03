-- Fix Step 2 diagnosis-to-template mapping discovered during the Moon Wax end-to-end approval test.
-- The original mapper used `code` as both a PL/pgSQL variable and a table column,
-- causing approval orchestration to fail with SQLSTATE 42702.

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

  update public.nexus_diagnosis_runs
  set orchestration_summary=coalesce(orchestration_summary,'{}'::jsonb)||jsonb_build_object('template_mapped_actions',mapped),updated_at=now()
  where id=p_run_id;
  return mapped;
end
$function$;
revoke all on function private.nexus_map_diagnosis_action_templates(uuid) from public,anon,authenticated;

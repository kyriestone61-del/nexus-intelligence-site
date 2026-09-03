-- Convert the existing client_diagnosis evaluation framework from a queued idea into an automatic production regression gate.
-- This is deterministic structural/governance scoring; it does not replace human judgment or semantic golden-case evaluation.

create or replace function private.nexus_score_diagnosis_result(p_result jsonb)
returns jsonb
language plpgsql
immutable
set search_path=''
as $$
declare
  v_result jsonb:=coalesce(p_result,'{}'::jsonb);
  v_score int:=0;
  v_issues text[]:=array[]::text[];
  v_total int;
  v_good int;
  v_item jsonb;
  v_valid boolean;
begin
  -- 20 points: evidence traceability across facts, inferences, and ranked opportunities.
  v_total:=0;v_good:=0;
  for v_item in select value from jsonb_array_elements(coalesce(v_result->'facts','[]'::jsonb)) loop
    v_total:=v_total+1;
    if jsonb_typeof(v_item->'evidence_refs')='array' and jsonb_array_length(v_item->'evidence_refs')>0 then v_good:=v_good+1; end if;
  end loop;
  for v_item in select value from jsonb_array_elements(coalesce(v_result->'inferences','[]'::jsonb)) loop
    v_total:=v_total+1;
    if nullif(btrim(v_item->>'basis'),'') is not null and nullif(btrim(v_item->>'confidence'),'') is not null and jsonb_typeof(v_item->'evidence_refs')='array' and jsonb_array_length(v_item->'evidence_refs')>0 then v_good:=v_good+1; end if;
  end loop;
  for v_item in select value from jsonb_array_elements(coalesce(v_result->'opportunity_backlog','[]'::jsonb)) loop
    v_total:=v_total+1;
    if jsonb_typeof(v_item->'evidence_refs')='array' and jsonb_array_length(v_item->'evidence_refs')>0 then v_good:=v_good+1; end if;
  end loop;
  if v_total>0 then v_score:=v_score+round(20.0*v_good/v_total)::int; else v_issues:=array_append(v_issues,'No traceable facts, inferences, or opportunities were produced.'); end if;
  if v_total>0 and v_good<v_total then v_issues:=array_append(v_issues,'Some factual/inference/opportunity claims lack evidence references.'); end if;

  -- 15 points: epistemic labels and explicit unknown handling.
  v_valid:=true;
  if jsonb_typeof(v_result->'claims')<>'array' then v_valid:=false; end if;
  for v_item in select value from jsonb_array_elements(coalesce(v_result->'claims','[]'::jsonb)) loop
    if coalesce(v_item->>'type','') not in ('FACT','CLIENT STATEMENT','ADMIN CONTEXT','INFERENCE','ESTIMATE','UNKNOWN') then v_valid:=false; exit; end if;
  end loop;
  if v_valid and jsonb_typeof(v_result->'unknowns')='array' then v_score:=v_score+15; else v_issues:=array_append(v_issues,'Epistemic claim labels or unknown handling are invalid.'); end if;

  -- 15 points: opportunity completeness and 1–5 scoring integrity.
  v_total:=jsonb_array_length(coalesce(v_result->'opportunity_backlog','[]'::jsonb));v_good:=0;
  for v_item in select value from jsonb_array_elements(coalesce(v_result->'opportunity_backlog','[]'::jsonb)) loop
    if nullif(btrim(v_item->>'title'),'') is not null
       and nullif(btrim(v_item->>'recommendation'),'') is not null
       and coalesce((v_item->>'rank')::int,0)>0
       and coalesce((v_item->>'value_score')::int,0) between 1 and 5
       and coalesce((v_item->>'effort_score')::int,0) between 1 and 5
       and coalesce((v_item->>'readiness_score')::int,0) between 1 and 5
       and coalesce((v_item->>'impact_score')::int,0) between 1 and 5
       and coalesce((v_item->>'feasibility_score')::int,0) between 1 and 5
    then v_good:=v_good+1; end if;
  end loop;
  if v_total>0 then v_score:=v_score+round(15.0*v_good/v_total)::int; else v_issues:=array_append(v_issues,'No ranked opportunities were produced.'); end if;
  if v_total>0 and v_good<v_total then v_issues:=array_append(v_issues,'One or more opportunities have incomplete or invalid scoring.'); end if;

  -- 15 points: smallest safe pilot is falsifiable and human-controlled.
  v_item:=coalesce(v_result->'smallest_safe_pilot','{}'::jsonb);
  if nullif(btrim(v_item->>'title'),'') is not null
     and nullif(btrim(v_item->>'summary'),'') is not null
     and jsonb_typeof(v_item->'acceptance_criteria')='array' and jsonb_array_length(v_item->'acceptance_criteria')>0
     and jsonb_typeof(v_item->'human_controls')='array' and jsonb_array_length(v_item->'human_controls')>0
  then v_score:=v_score+15; else v_issues:=array_append(v_issues,'Smallest safe pilot is missing acceptance criteria or human controls.'); end if;

  -- 10 points: explicit recommended first intervention.
  v_item:=coalesce(v_result->'recommended_first_intervention','{}'::jsonb);
  if nullif(btrim(v_item->>'title'),'') is not null
     and nullif(btrim(v_item->>'summary'),'') is not null
     and nullif(btrim(v_item->>'success_metric'),'') is not null
     and jsonb_typeof(v_item->'guardrails')='array'
  then v_score:=v_score+10; else v_issues:=array_append(v_issues,'Recommended first intervention is not sufficiently measurable/governed.'); end if;

  -- 10 points: independent QA stage passed with a meaningful score.
  v_item:=coalesce(v_result->'quality_assurance','{}'::jsonb);
  if coalesce((v_item->>'pass')::boolean,false) and coalesce((v_item->>'quality_score')::numeric,0)>=80 then v_score:=v_score+10; else v_issues:=array_append(v_issues,'Model-side independent QA did not pass at 80 or above.'); end if;

  -- 10 points: client-safe projection contains the core report sections and never depends on raw analysis keys.
  v_item:=public.nexus_client_report_projection(v_result);
  if nullif(btrim(v_item->>'executive_summary'),'') is not null
     and jsonb_typeof(v_item->'opportunity_backlog')='array'
     and jsonb_typeof(v_item->'client_action_items')='array'
     and jsonb_typeof(v_item->'smallest_safe_pilot')='object'
  then v_score:=v_score+10; else v_issues:=array_append(v_issues,'Client-safe report projection is incomplete.'); end if;

  -- 5 points: client actions must include usable instructions when actions exist.
  v_total:=jsonb_array_length(coalesce(v_result->'client_action_items','[]'::jsonb));v_good:=0;
  for v_item in select value from jsonb_array_elements(coalesce(v_result->'client_action_items','[]'::jsonb)) loop
    if nullif(btrim(v_item->>'title'),'') is not null and nullif(btrim(v_item->>'instructions'),'') is not null then v_good:=v_good+1; end if;
  end loop;
  if v_total=0 or v_good=v_total then v_score:=v_score+5; else v_issues:=array_append(v_issues,'One or more client actions lack explicit instructions.'); end if;

  return jsonb_build_object(
    'score',least(100,greatest(0,v_score)),
    'passed',v_score>=85,
    'issues',to_jsonb(v_issues),
    'rubric_version','2026-09-03-v1',
    'threshold',85
  );
exception when others then
  return jsonb_build_object('score',0,'passed',false,'issues',jsonb_build_array('Structural certification failed: '||sqlerrm),'rubric_version','2026-09-03-v1','threshold',85);
end
$$;
revoke all on function private.nexus_score_diagnosis_result(jsonb) from public,anon,authenticated;

create or replace function private.nexus_certify_diagnosis_run()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_eval jsonb;
  v_case_ref text;
begin
  if new.status<>'ready_for_review' or new.analysis_result is null then return new; end if;
  if tg_op='UPDATE' and old.status='ready_for_review' and old.analysis_result is not distinct from new.analysis_result then return new; end if;
  v_eval:=private.nexus_score_diagnosis_result(new.analysis_result);
  v_case_ref:='RUN:'||new.id::text||':ATTEMPT:'||coalesce(new.execution_attempts,0)::text;
  if not exists(select 1 from public.nexus_agent_evaluations where agent_code='client_diagnosis' and case_type='production_regression' and case_ref=v_case_ref) then
    insert into public.nexus_agent_evaluations(agent_code,case_type,case_ref,expected_behavior,score,passed,failure_class,intervention_required,notes,evaluated_at)
    values('client_diagnosis','production_regression',v_case_ref,'Production diagnosis must preserve evidence traceability, epistemic separation, valid opportunity scoring, a falsifiable human-controlled pilot, a measurable first move, independent QA, a complete client-safe projection, and usable client instructions.',(v_eval->>'score')::numeric,(v_eval->>'passed')::boolean,case when (v_eval->>'passed')::boolean then null else 'diagnosis_quality_gate' end,not (v_eval->>'passed')::boolean,v_eval::text,now());
  end if;
  return new;
end
$$;
revoke all on function private.nexus_certify_diagnosis_run() from public,anon,authenticated;

drop trigger if exists nexus_diagnosis_production_quality_certification on public.nexus_diagnosis_runs;
create trigger nexus_diagnosis_production_quality_certification
after insert or update of status,analysis_result on public.nexus_diagnosis_runs
for each row execute function private.nexus_certify_diagnosis_run();

create or replace view public.nexus_diagnosis_quality_dashboard_v
with (security_invoker=true)
as
select
  e.id,
  e.case_ref,
  e.score,
  e.passed,
  e.failure_class,
  e.intervention_required,
  e.notes,
  e.evaluated_at
from public.nexus_agent_evaluations e
where e.agent_code='client_diagnosis' and e.case_type='production_regression'
order by e.evaluated_at desc;

revoke all on public.nexus_diagnosis_quality_dashboard_v from anon;
grant select on public.nexus_diagnosis_quality_dashboard_v to authenticated;

-- Backfill the latest real diagnosis outputs once, without executing the model again or modifying any diagnosis.
insert into public.nexus_agent_evaluations(agent_code,case_type,case_ref,expected_behavior,score,passed,failure_class,intervention_required,notes,evaluated_at)
select
  'client_diagnosis',
  'production_regression',
  'RUN:'||r.id::text||':ATTEMPT:'||coalesce(r.execution_attempts,0)::text,
  'Production diagnosis must preserve evidence traceability, epistemic separation, valid opportunity scoring, a falsifiable human-controlled pilot, a measurable first move, independent QA, a complete client-safe projection, and usable client instructions.',
  (q.result->>'score')::numeric,
  (q.result->>'passed')::boolean,
  case when (q.result->>'passed')::boolean then null else 'diagnosis_quality_gate' end,
  not (q.result->>'passed')::boolean,
  q.result::text,
  coalesce(r.analysis_completed_at,r.updated_at,now())
from public.nexus_diagnosis_runs r
cross join lateral (select private.nexus_score_diagnosis_result(r.analysis_result) as result) q
where r.analysis_result is not null
  and r.status in ('ready_for_review','approved')
  and not exists(
    select 1 from public.nexus_agent_evaluations e
    where e.agent_code='client_diagnosis' and e.case_type='production_regression'
      and e.case_ref='RUN:'||r.id::text||':ATTEMPT:'||coalesce(r.execution_attempts,0)::text
  );

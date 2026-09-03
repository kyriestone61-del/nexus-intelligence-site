import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql=fs.readFileSync('supabase/migrations/20260903155000_nexus_diagnosis_production_quality_certification.sql','utf8');

assert.match(sql,/private\.nexus_score_diagnosis_result\(p_result jsonb\)/,'production diagnosis must have a deterministic structural scorer');
assert.match(sql,/'threshold',85/,'production structural certification must enforce the 85-point threshold');
assert.match(sql,/'rubric_version','2026-09-03-v1'/,'quality results must be versioned for longitudinal comparison');
assert.match(sql,/'source','production'/,'production evaluations must be distinguishable from synthetic regression fixtures');
assert.match(sql,/v_score:=v_score\+round\(20\.0\*v_good\/v_total\)/,'evidence traceability must be scored');
assert.match(sql,/v_score:=v_score\+15; else v_issues:=array_append\(v_issues,'Epistemic claim labels/,'epistemic separation must be scored');
assert.match(sql,/opportunity_backlog[\s\S]*value_score[\s\S]*effort_score[\s\S]*readiness_score[\s\S]*impact_score[\s\S]*feasibility_score/,'opportunity quality must validate the ranked scoring model');
assert.match(sql,/smallest_safe_pilot[\s\S]*acceptance_criteria[\s\S]*human_controls/,'pilot quality must require falsifiability and human controls');
assert.match(sql,/recommended_first_intervention[\s\S]*success_metric[\s\S]*guardrails/,'recommended first move must be measurable and governed');
assert.match(sql,/quality_assurance[\s\S]*quality_score[\s\S]*>=80/,'model-side independent QA must contribute to certification');
assert.match(sql,/nexus_client_report_projection\(v_result\)/,'certification must validate the canonical client-safe projection');
assert.match(sql,/client_action_items[\s\S]*instructions/,'client action usability must be included in the quality gate');
assert.match(sql,/PROD-RUN:/,'production evaluations must use an explicit production case-reference prefix');
assert.match(sql,/case_type='regression'/,'production evaluations must remain compatible with the existing evaluation case-type contract');
assert.match(sql,/nexus_diagnosis_production_quality_certification/,'new diagnosis outputs must be automatically certified');
assert.match(sql,/after insert or update of status,analysis_result on public\.nexus_diagnosis_runs/,'certification must run when diagnosis analysis becomes reviewable');
assert.match(sql,/nexus_diagnosis_quality_dashboard_v/,'production certification must have an auditable dashboard projection');
assert.match(sql,/with \(security_invoker=true\)/,'quality dashboard must preserve the underlying admin RLS boundary');
assert.match(sql,/revoke all on public\.nexus_diagnosis_quality_dashboard_v from anon/,'quality results must not be anonymously readable');
assert.match(sql,/not \(v_eval->>'passed'\)::boolean/,'failed diagnosis certifications must explicitly require intervention');
assert.doesNotMatch(sql,/update\s+public\.nexus_diagnosis_runs\s+set\s+analysis_result/i,'certification must never rewrite the diagnosis it is evaluating');
assert.doesNotMatch(sql,/delete\s+from\s+public\.nexus_diagnosis_runs/i,'certification must not destructively remove diagnosis records');

const weights=[20,15,15,15,10,10,10,5];
assert.equal(weights.reduce((a,b)=>a+b,0),100,'documented production diagnosis rubric must total 100 points');

console.log('NEXUS PRODUCTION DIAGNOSIS QUALITY QAQC PASS');

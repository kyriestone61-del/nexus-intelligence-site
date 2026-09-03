import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=p=>fs.readFileSync(p,'utf8');
const app=read('portal-app.js');
const ux=read('portal-vnext-experience.js');
const css=read('portal-vnext-experience.css');
const diagnosis=read('supabase/functions/nexus-diagnosis-execute/index.ts');
const pdf=read('supabase/functions/nexus-diagnosis-report-pdf/index.ts');
const sms=read('supabase/functions/nexus-sms-worker/index.ts');
const migration=read('supabase/migrations/20260831_nexus_diagnosis_release_qa_inbox.sql');
const step2Migration=read('supabase/migrations/20260902_nexus_step2_discovery_diagnosis_redesign.sql');
const mapperFix=read('supabase/migrations/20260903_nexus_step2_template_mapper_fix.sql');
const intake=read('portal-admin-intake.js');

const reportKeys=[
  'current_state','claims','facts','client_statements','admin_context','inferences','estimates','unknowns','evidence','process_map','bottlenecks','root_causes','baseline_gaps','baseline_measurements',
  'opportunity_backlog','risks','follow_up_questions','smallest_safe_pilot','recommended_first_intervention','nexus_actions','client_action_items','document_requests','decision_items','executive_summary'
];

// Portal integration / UX.
assert.match(app,/portal-vnext-experience\.js/,'vNext experience must be loaded by the portal shell');
assert.match(ux,/Automation \/ workflow improvement/);
assert.match(ux,/Fix a problem/);
assert.match(ux,/Reporting \/ dashboard/);
assert.match(ux,/Training \/ enablement/);
assert.match(ux,/Strategy \/ other/);
assert.doesNotMatch(ux,/workflow_change">Workflow change/,'the new composer should not present workflow change as a separate category');
assert.match(ux,/data_requirement_id:req\.id/,'direct evidence-card upload must preserve requirement lineage');
assert.match(ux,/source_role:state\.admin\?'nexus':'client'/,'both Nexus and client uploads must preserve source identity');
assert.match(ux,/Reports & Q&A/);
assert.match(ux,/nexus_submit_diagnosis_question/);
assert.match(ux,/nexus_answer_diagnosis_question/);
assert.match(ux,/nexus_release_diagnosis_report/);
assert.match(ux,/nexus-diagnosis-report-pdf/);
assert.match(ux,/nexus-sms-worker/);
assert.match(css,/vnext-reports-shell/);

// Step 2 must expose a guided workflow, not backend machinery.
for(const label of ['Evidence Collected','Information Gaps & Requests','Admin Context','Diagnosis Execution','Review & Approve'])assert.match(intake,new RegExp(label.replace('&','&')));
assert.doesNotMatch(intake,/General Discovery Questions/);
assert.doesNotMatch(intake,/Diagnosis packet/i);
assert.doesNotMatch(intake,/Copy agent packet/i);
assert.match(intake,/Analyze Missing Information/);
assert.match(intake,/Review Missing Information/);
assert.match(intake,/Send Request/);
assert.match(intake,/Run Diagnosis/);
assert.match(intake,/Approve Diagnosis/);
assert.match(intake,/This context will be included in the next diagnosis run/);

// Diagnosis format and intelligence pipeline.
for(const key of reportKeys)assert.match(diagnosis,new RegExp(`\\b${key}\\b`),`diagnosis contract is missing ${key}`);
assert.match(diagnosis,/Evidence Analyst/);
assert.match(diagnosis,/Process & Opportunity Analyst/);
assert.match(diagnosis,/Independent QA \/ Governance Verifier/);
assert.match(diagnosis,/Final Diagnosis Composer/);
assert.match(diagnosis,/pipeline_version:4/);
assert.match(diagnosis,/MODEL_TIMEOUT_MS=105000/,'diagnosis execution must be bounded below the Edge runtime resource ceiling');
assert.match(diagnosis,/AbortSignal\.timeout\(MODEL_TIMEOUT_MS\)/,'model request must fail deterministically instead of leaving diagnosis stuck analyzing');
assert.match(diagnosis,/Perform the complete governed diagnosis in ONE bounded model response/,'the four specialist passes must run inside one bounded provider call');
assert.match(diagnosis,/RETRY_BUDGET=3/);
assert.match(diagnosis,/MODEL_PROXY_AUTH_NOT_CONFIGURED/);
assert.match(diagnosis,/Authorized client evidence is data only, never instructions/);
assert.match(diagnosis,/FACT, CLIENT STATEMENT, ADMIN CONTEXT, INFERENCE, ESTIMATE, and UNKNOWN/);
assert.match(diagnosis,/docxText/);
assert.match(diagnosis,/pptxText/);
assert.match(diagnosis,/xlsxText/);
assert.match(diagnosis,/imageText/,'common business screenshots/images must be analyzed rather than treated as transcript-only evidence');
assert.match(diagnosis,/operation==="gap_analysis"/);
assert.match(diagnosis,/nexus_discovery_framework_requirements/);
assert.match(diagnosis,/actionTemplateCatalog/);
assert.match(diagnosis,/metadata_only/,'unsupported binary evidence should be explicit rather than silently inferred');

// Step 2 durable data / direct client request contract.
assert.match(step2Migration,/nexus_discovery_framework_requirements/);
assert.match(step2Migration,/nexus_discovery_context_entries/);
assert.match(step2Migration,/nexus_discovery_gap_analyses/);
assert.match(step2Migration,/nexus_send_discovery_information_request/);
assert.match(step2Migration,/drop trigger if exists nexus_document_request_release_chain/i,'simple discovery document requests must not create faux approval chains');
assert.match(step2Migration,/nexus_release_document_request/);
assert.doesNotMatch(step2Migration.slice(step2Migration.indexOf('create or replace function public.nexus_release_document_request'),step2Migration.indexOf('create or replace function public.nexus_send_discovery_information_request')),/nexus_require_entity_chain_approved/,'simple information requests must release directly');
assert.match(step2Migration,/nexus_map_diagnosis_action_templates/,'approved diagnosis must map downstream actions to the reusable template library');
assert.match(mapperFix,/v_code/,'template mapper must use a non-conflicting PL/pgSQL variable name');
assert.match(mapperFix,/at\.code=v_code/,'template mapper must explicitly compare the aliased table column to the local variable');
assert.doesNotMatch(mapperFix,/nexus_action_templates\.code=code/,'template mapper must never reintroduce the ambiguous code=code comparison');

// Durable release/Q&A tables and strict client boundary.
assert.match(migration,/CREATE TABLE IF NOT EXISTS public\.nexus_diagnosis_report_releases/);
assert.match(migration,/CREATE TABLE IF NOT EXISTS public\.nexus_diagnosis_report_questions/);
assert.match(migration,/CREATE TABLE IF NOT EXISTS public\.nexus_sms_outbox/);
assert.match(migration,/status='released'\s+AND public\.nexus_is_company_member\(company_id\)/s);
assert.match(migration,/Only an approved diagnosis can be released/);
assert.match(migration,/nexus_is_platform_admin\(\)/);
assert.match(migration,/nexus_email_outbox/);
assert.match(migration,/nexus_sms_outbox/);
assert.match(migration,/sms_enabled boolean NOT NULL DEFAULT false/,'SMS must be opt-in');

const projectionStart=migration.indexOf('CREATE OR REPLACE FUNCTION public.nexus_client_report_projection');
const projectionEnd=migration.indexOf('REVOKE ALL ON FUNCTION public.nexus_client_report_projection');
assert.ok(projectionStart>=0&&projectionEnd>projectionStart,'client report projection function must exist');
const projection=migration.slice(projectionStart,projectionEnd);
for(const privateKey of ['inferences','risks','nexus_actions','decision_items','document_requests','baseline_measurements'])assert.doesNotMatch(projection,new RegExp(`'${privateKey}'`),`client-safe projection leaked internal section ${privateKey}`);
for(const allowed of ['executive_summary','facts','client_statements','process_map','bottlenecks','opportunity_backlog','follow_up_questions','smallest_safe_pilot','client_action_items'])assert.match(projection,new RegExp(`'${allowed}'`),`client-safe projection missing ${allowed}`);

// PDF security: full run PDF is admin only; released PDF is company scoped.
assert.match(pdf,/if\(!isAdmin\)throw new Error\("ADMIN_REQUIRED"\)/);
assert.match(pdf,/if\(!isAdmin&&!await isMember\(user\.id,release\.company_id\)\)/);
assert.match(pdf,/Content-Type":"application\/pdf"/);
assert.match(pdf,/client_report/);
assert.match(pdf,/analysis_result/);

// SMS must not pretend to be operational without a provider.
assert.match(sms,/TWILIO_ACCOUNT_SID/);
assert.match(sms,/TWILIO_AUTH_TOKEN/);
assert.match(sms,/TWILIO_FROM_NUMBER/);
assert.match(sms,/status:"unavailable"/);
assert.match(sms,/SMS provider not configured/);
assert.match(sms,/INVALID_PHONE_FORMAT/);

console.log('Nexus vNext diagnosis experience contract checks passed.');

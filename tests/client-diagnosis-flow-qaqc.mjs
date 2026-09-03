import assert from 'node:assert/strict';
import fs from 'node:fs';

const flow=fs.readFileSync('portal-client-diagnosis-flow.js','utf8');
const loader=fs.readFileSync('portal-task-file-attachments-live.js','utf8');
const migration=fs.readFileSync('supabase/migrations/20260903191000_nexus_diagnosis_client_flow_guardrails.sql','utf8');
const headers=fs.readFileSync('_headers','utf8');

assert.match(loader,/portal-client-diagnosis-flow\.js\?v=\$\{DIAGNOSIS_FLOW_BUILD\}/,'client runtime must load the diagnosis approval flow');
assert.match(flow,/task_type\)==='approval'/,'flow must recognize approval tasks');
assert.match(flow,/phase\)==='diagnosis'/,'flow must limit guided report routing to diagnosis approvals');
assert.match(flow,/source_diagnosis_run_id/,'diagnosis approval must be anchored to its diagnosis run');
assert.match(flow,/Review & approve diagnosis →/,'real client CTA must clearly open the diagnosis');
assert.match(flow,/Preview diagnosis approval →/,'administrator Client View must use preview wording');
assert.match(flow,/Diagnosis report not released yet/,'unreleased diagnosis approval must not pretend it is actionable');
assert.match(flow,/NexusClientShell\?\.activateView\?\.\('reports'\)/,'diagnosis task must route directly to Reports');
assert.match(flow,/data-diagnosis-approve/,'released report must expose a direct approval action');
assert.match(flow,/data-diagnosis-request-changes/,'released report must expose a change-request path');
assert.match(flow,/nexus_submit_diagnosis_report_decision/,'report decision must use the canonical secured RPC');
assert.match(flow,/state\.previewReadOnly===true/,'administrator Client View must remain read-only');
assert.match(flow,/Approval does not authorize implementation, production access, or additional paid work/,'approval boundary must be explicit');
assert.match(flow,/Diagnosis approved\. Your next step is/,'successful approval must tell the client what happens next');
assert.match(flow,/Change request sent/,'change-request handoff must explain the next state');

assert.match(migration,/Nexus releases your diagnosis report/,'canonical action context must gate approval on report release');
assert.match(migration,/Release the client-safe diagnosis report before releasing this approval task/,'admin release RPC must refuse impossible diagnosis approvals');
assert.match(migration,/nexus_open_diagnosis_approval_on_report_release/,'report release must open the matching client approval');
assert.match(migration,/nexus_sync_diagnosis_approval_from_client_decision/,'client decision must synchronize the task state');
assert.match(migration,/status='completed'/,'approved diagnosis must complete the matching client task');
assert.match(migration,/status='ready_for_review'/,'change request must hand the task back to Nexus');
assert.match(migration,/set status='draft',notify_client=false/,'already-exposed impossible approval tasks must be repaired');
assert.match(migration,/nexus_diagnosis_report_releases/,'guardrails must use the released report as the authoritative gate');
assert.match(migration,/nexus_diagnosis_report_client_decisions/,'guardrails must use the version-specific client decision table');

assert.match(headers,/\/portal-\*\.js[\s\S]*Cache-Control: no-store, max-age=0/,'portal JS must not be served stale during authenticated workflow changes');
assert.match(headers,/\/portal-\*\.css[\s\S]*Cache-Control: no-store, max-age=0/,'portal CSS must not be served stale during authenticated workflow changes');

for(const browserFile of [flow,loader]){
  assert.equal(/service[_-]?role|SUPABASE_SERVICE|RESEND_API_KEY|TWILIO_AUTH_TOKEN|SECRET_KEY/.test(browserFile),false,'client diagnosis browser code must not contain privileged credentials');
}

console.log('NEXUS CLIENT DIAGNOSIS FLOW QAQC PASS');

import assert from 'node:assert/strict';
import fs from 'node:fs';

const flow=fs.readFileSync('portal-client-diagnosis-flow.js','utf8');
const deepLink=fs.readFileSync('portal-client-diagnosis-deeplink.js','utf8');
const loader=fs.readFileSync('portal-task-file-attachments-live.js','utf8');
const releaseQueue=fs.readFileSync('portal-diagnosis-release-queue.js','utf8');
const migration=fs.readFileSync('supabase/migrations/20260903191000_nexus_diagnosis_client_flow_guardrails.sql','utf8');
const headers=fs.readFileSync('_headers','utf8');

assert.match(loader,/portal-client-diagnosis-flow\.js\?v=\$\{DIAGNOSIS_FLOW_BUILD\}/,'client runtime must load the diagnosis approval flow');
assert.match(loader,/portal-client-diagnosis-deeplink\.js\?v=\$\{DIAGNOSIS_FLOW_BUILD\}/,'client runtime must load diagnosis notification deep links after the approval flow');
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

assert.match(deepLink,/view==='diagnosis-report'/,'notification deep link must recognize the diagnosis report route');
assert.match(deepLink,/params\.get\('release'\)/,'notification deep link must retain the exact release id');
assert.match(deepLink,/NexusClientShell\?\.activateView\?\.\('reports'\)/,'notification must open the Reports area');
assert.match(deepLink,/data-diagnosis-release-id/,'notification must target the exact released report');

assert.match(releaseQueue,/data-nexus-release-report/,'admin diagnosis review must expose a dedicated report release gate');
assert.match(releaseQueue,/nexus_release_diagnosis_report/,'report release must use the canonical secured admin RPC');
assert.match(releaseQueue,/Release the diagnosis before asking the client to approve it/,'admin UI must explain the required sequence');
assert.match(releaseQueue,/Approve diagnosis and first priority/,'admin UI must explain which client task opens after report release');
assert.match(releaseQueue,/Release updated report/,'admin must be able to publish a revised report version');
assert.match(releaseQueue,/task_type,phase/,'generic release queue must know which draft is the diagnosis approval');
assert.match(releaseQueue,/task_type\|\|''\)\.toLowerCase\(\)==='approval'/,'generic release queue must not offer the diagnosis approval before its report');

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

for(const browserFile of [flow,deepLink,loader,releaseQueue]){
  assert.equal(/service[_-]?role|SUPABASE_SERVICE|RESEND_API_KEY|TWILIO_AUTH_TOKEN|SECRET_KEY/.test(browserFile),false,'diagnosis browser code must not contain privileged credentials');
}

console.log('NEXUS CLIENT DIAGNOSIS FLOW QAQC PASS');

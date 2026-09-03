import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync('portal-app.js','utf8');
const ui=fs.readFileSync('portal-client-report-decision.js','utf8');
const sql=fs.readFileSync('supabase/migrations/20260903160500_nexus_client_diagnosis_approval.sql','utf8');

assert.match(app,/portal-client-report-decision\.js/,'client diagnosis approval controls must load in the client shell');
assert.match(ui,/nexus_diagnosis_report_client_decisions/,'client UI must load the current report-version decision');
assert.match(ui,/nexus_submit_diagnosis_report_decision/,'client decisions must be submitted through the server-authoritative RPC');
assert.match(ui,/Approve report/,'released reports must expose an explicit approval action');
assert.match(ui,/Request changes instead/,'released reports must expose a change-request path');
assert.match(ui,/does not purchase or activate any solution/,'report approval must remain separate from commercial implementation selection');
assert.match(ui,/cards\.length!==releases\.length/,'approval controls must fail closed if report/release ordering cannot be reconciled');
assert.match(ui,/Explain what needs to change/,'change requests must require actionable client feedback');
assert.doesNotMatch(ui,/service[_-]?role|SUPABASE_SERVICE|SECRET_KEY/,'browser approval controls must not contain privileged credentials');

assert.match(sql,/create table if not exists public\.nexus_diagnosis_report_client_decisions/,'client report decisions must be durable records');
assert.match(sql,/unique\(release_id,report_version,decided_by\)/,'approval must be version-specific and user-specific');
assert.match(sql,/decision in \('approved','changes_requested'\)/,'decision vocabulary must be explicit');
assert.match(sql,/decision<>'changes_requested' or nullif\(btrim\(note\),''\) is not null/,'change requests must require a note');
assert.match(sql,/decided_by=auth\.uid\(\)/,'client decision read access must remain user-scoped under RLS');
assert.match(sql,/public\.nexus_is_company_member\(v_release\.company_id\)/,'decision submission must require company membership');
assert.match(sql,/Review client diagnosis changes — report v/,'a change request must create an explicit Nexus-owned remediation task');
assert.match(sql,/'diagnosis_client_revision'/,'client change requests must have a dedicated task type');
assert.match(sql,/'nexus','open','high'/,'client change requests must enter the Nexus Action Inbox as high-priority Nexus-owned work');
assert.match(sql,/immutable AI diagnosis and founder adjustment audit trail/,'client revisions must preserve source provenance');
assert.match(sql,/diagnosis_client_decision/,'client approval/change decisions must be written to the activity log');
assert.match(sql,/Implementation selections remain separate/,'server notification must keep diagnosis approval separate from commercial activation');
assert.doesNotMatch(sql,/update\s+public\.nexus_diagnosis_runs\s+set\s+analysis_result/i,'client decisions must never mutate the raw AI diagnosis');

console.log('NEXUS CLIENT DIAGNOSIS APPROVAL QAQC PASS');

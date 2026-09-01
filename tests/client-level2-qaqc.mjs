import fs from 'node:fs';
import assert from 'node:assert/strict';
const read=file=>fs.readFileSync(file,'utf8');
const app=read('portal-app.js'),runtime=read('portal-runtime-core.js'),store=read('portal-nexus-store.js'),client=read('portal-client-control-room.js'),css=read('portal-client-control-room.css'),admin=read('portal-admin-command-center.js'),health=read('portal-health-check.js'),upload=read('portal-client-upload-service.js'),migration=read('supabase/migrations/20260901211143_nexus_client_intake_roi_engine.sql');

for(const file of ['portal-nexus-store.js','portal-client-control-room.js','portal-client-control-room.css','portal-admin-command-center.js','portal-admin-command-center.css','portal-health-check.js'])assert.ok(app.includes(file),`loader missing ${file}`);
assert.doesNotMatch(app,/portal-client-shell(?:-v2)?\.(?:js|css)/);
for(const [key,label] of [['overview','Today'],['intake','Intake'],['data-room','Data Room'],['action-queue','Actions'],['roadmap','Roadmap'],['ledger','Value'],['inbox','Inbox']])assert.ok(client.includes(`['${key}','${label}']`),`missing ${key}`);
for(const phase of ['Discovery','Diagnosis','Prioritization','Implementation','Optimization'])assert.ok(client.includes(`'${phase}'`),`missing lifecycle ${phase}`);
assert.match(client,/Your Next Single Step/);assert.match(client,/nexus_client_intake/);assert.match(client,/nexus_roi_estimates/);assert.match(client,/preserveUploadNode/);assert.match(client,/nexus_decide_approval_step/);assert.match(client,/nexus_submit_diagnosis_question/);assert.match(client,/nexus_client_requests/);assert.match(client,/window\.NexusStore/);assert.match(client,/events\.createScope/);assert.match(client,/scope\.delegate/);assert.doesNotMatch(client,/document\.addEventListener\(/);
assert.match(store,/currentUser/);assert.match(store,/activeTab/);assert.match(store,/modalState/);assert.match(store,/clientData/);assert.match(store,/uploadQueue/);assert.match(store,/setClientData/);
for(const symbol of ['stableEvent','showRetryToast','createScope','createModalManager'])assert.ok(runtime.includes(symbol),`runtime missing ${symbol}`);
for(const modal of ['ADD_ACTION','ADD_MEASUREMENT','ADD_MILESTONE','REQUEST_ITEM'])assert.ok(runtime.includes(modal));
assert.match(admin,/Admin Master View/);assert.match(admin,/Diagnosis & ROI Builder/);assert.match(admin,/Generate ROI drafts/);assert.match(admin,/nexus_request_entity_approval/);assert.match(admin,/nexus_release_diagnosis_report/);assert.match(admin,/company_role/);assert.match(admin,/directional/);
assert.match(upload,/mp3/);assert.match(upload,/mp4/);assert.match(upload,/setUploadQueue/);assert.match(upload,/remove\(\[path\]\)/);
assert.match(health,/window\.__NEXUS_HEALTH_CHECK/);assert.match(health,/persistent test writes: 0/);for(const key of ['overview','intake','data-room','action-queue','roadmap','ledger','inbox'])assert.ok(health.includes(`'${key}'`));assert.match(health,/DIAGNOSIS_BUILDER/);
for(const token of ['@media(max-width:760px)','@media(max-width:390px)','min-height:44px','env(safe-area-inset-bottom)','font-size:16px!important'])assert.ok(css.includes(token),`CSS missing ${token}`);
assert.match(migration,/create table if not exists public\.nexus_client_intake/);assert.match(migration,/create table if not exists public\.nexus_roi_estimates/);assert.match(migration,/enable row level security/);assert.match(migration,/nexus members view published roi estimates/);
console.log('Nexus full client/admin reconciliation static QA: PASSED');

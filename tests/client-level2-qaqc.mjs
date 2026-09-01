import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = file => fs.readFileSync(file, 'utf8');
const app = read('portal-app.js');
const runtime = read('portal-runtime-core.js');
const shell = read('portal-client-shell.js');
const css = read('portal-client-shell.css');
const health = read('portal-health-check.js');

assert.match(app, /portal-client-shell\.css/);
assert.match(app, /portal-client-shell\.js/);
assert.match(app, /portal-health-check\.js/);
assert.doesNotMatch(app, /portal-client-shell-v2\.(?:js|css)/);

for (const [key, label] of [
  ['overview', 'Today'],
  ['data-room', 'Data Room'],
  ['action-queue', 'Actions'],
  ['projects', 'Projects'],
  ['ledger', 'Improvements'],
  ['notifications', 'Notifications']
]) assert.ok(shell.includes(`['${key}', '${label}']`), `missing ${key}`);

assert.match(shell, /Your Next Single Step/);
assert.match(shell, /window\.NexusStore/);
assert.match(shell, /events\.createScope/);
assert.match(shell, /scope\.delegate/);
assert.match(shell, /aria-selected/);
assert.match(shell, /data-room-dropzone/);
assert.match(shell, /nexus_decide_approval_step/);
assert.match(shell, /Submit to Nexus/);
assert.doesNotMatch(shell, /document\.addEventListener\(/);

assert.match(runtime, /function stableEvent/);
assert.match(runtime, /showRetryToast/);
assert.match(runtime, /createScope/);
assert.match(runtime, /ADD_ACTION/);
assert.match(runtime, /ADD_MEASUREMENT/);
assert.match(runtime, /ADD_MILESTONE/);
assert.match(runtime, /REQUEST_ITEM/);

assert.match(health, /window\.__NEXUS_HEALTH_CHECK/);
for (const key of ['overview', 'data-room', 'action-queue', 'projects', 'ledger', 'notifications']) assert.ok(health.includes(`'${key}'`));
for (const key of ['taskModal', 'metricModal', 'milestoneModal', 'documentRequestModal']) assert.ok(health.includes(`'${key}'`));
assert.match(health, /No console errors during check/);

assert.match(css, /@media\(max-width:760px\)/);
assert.match(css, /@media\(max-width:390px\)/);
assert.match(css, /min-height:44px/);
assert.match(css, /env\(safe-area-inset-bottom\)/);
assert.match(css, /overflow-x:hidden/);
assert.match(css, /font-size:16px!important/);
assert.match(css, /nexus-client-dropzone/);

console.log('Nexus Level Two static QA: PASSED');

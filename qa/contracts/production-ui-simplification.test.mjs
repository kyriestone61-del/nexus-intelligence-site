import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const portalApp=readFileSync(new URL('../../portal-app.js',import.meta.url),'utf8');
const simplify=readFileSync(new URL('../../portal-production-simplification.js',import.meta.url),'utf8');
const clientShell=readFileSync(new URL('../../portal-client-shell-v2.js',import.meta.url),'utf8');
const companies=readFileSync(new URL('../../portal-buildingblok-cohesion.js',import.meta.url),'utf8');
const inbox=readFileSync(new URL('../../portal-approval-inbox.js',import.meta.url),'utf8');
const resolution=readFileSync(new URL('../../portal-resolution-plan.js',import.meta.url),'utf8');
const lifecycle=readFileSync(new URL('../../portal-phase-zero-lifecycle.js',import.meta.url),'utf8');
const redirects=readFileSync(new URL('../../_redirects',import.meta.url),'utf8');

test('portal uses an explicit current RELYSTRA build and loads Phase Zero in both role shells',()=>{
  assert.match(portalApp,/const BUILD='20260905-relystra-[a-z0-9-]+'/);
  assert.match(portalApp,/portal-phase-zero-lifecycle\.css/);
  assert.equal((portalApp.match(/portal-phase-zero-lifecycle\.js/g)||[]).length,2);
  const clientLifecycle=portalApp.indexOf("portal-phase-zero-lifecycle.js?v=${BUILD}`),'Phase Zero engagement lifecycle'");
  const clientSimplification=portalApp.indexOf("portal-production-simplification.js?v=${BUILD}`),'production simplification'",clientLifecycle);
  assert.ok(clientLifecycle>=0&&clientSimplification>clientLifecycle,'client Phase Zero must load before the final no-op simplification marker');
});

test('client daily workspace stays intentionally small and action-oriented',()=>{
  assert.match(clientShell,/const PRIMARY_VIEWS=\[\['today','01 Today'\],\['files','02 Secure Data Room'\],\['improvement','03 Improvement Record'\]\]/);
  assert.match(clientShell,/Your next move\./);
  assert.match(clientShell,/Relystra will put the next required action here when it is actually ready/);
  assert.match(clientShell,/Important boundaries/);
});

test('admin portfolio and Decisions surfaces remain role-specific',()=>{
  assert.match(companies,/data\.section='companies'/);
  assert.match(companies,/Portfolio operating view/);
  assert.match(companies,/Open workspace/);
  assert.match(inbox,/function founderDecisionsMode\(\)/);
  assert.match(inbox,/label=founderMode\?'Decisions':'Inbox'/);
  assert.match(inbox,/Approval & action routing/);
});

test('diagnosis solution selection now enters the Phase Zero commercial gate',()=>{
  assert.match(resolution,/nexus_phase_zero_confirm_resolution_plan/);
  assert.doesNotMatch(resolution,/sb\.rpc\('nexus_confirm_resolution_plan'/);
  assert.match(resolution,/Confirmed for commercial close/);
  assert.match(resolution,/implementation is not released until signed scope, payment verification, and kickoff are complete/);
});

test('Phase Zero UI makes verified measured client acceptance the finish line',()=>{
  for(const label of ['Understand','Diagnose','Agree & Pay','Kickoff','Build','Verify','Measure','Accept','Complete'])assert.match(lifecycle,new RegExp(label.replace('&','\\&')));
  assert.match(lifecycle,/Does the delivered result meet the agreed outcome\?/);
  assert.match(lifecycle,/Implementation, QA, measurement, handoff, and client acceptance are all recorded/);
});

test('final simplification marker is deliberately non-invasive',()=>{
  assert.match(simplify,/no runtime behavior change/i);
  assert.doesNotMatch(simplify,/new MutationObserver/);
  assert.doesNotMatch(simplify,/observer\.observe\(document\.body/);
  assert.doesNotMatch(simplify,/setInterval\(/);
});

test('advanced admin filtering remains behind dedicated operating surfaces',()=>{
  assert.match(companies,/nexusCompanySearch/);
  assert.match(companies,/nexusCompanyLifecycle/);
  assert.match(companies,/nexusInboxAdvancedFilters/);
  assert.match(inbox,/nexus-inbox-filters/);
});

test('legacy duplicate workflows redirect to canonical surfaces',()=>{
  assert.match(redirects,/\/operations \/portal\?view_mode=admin 301/);
  assert.match(redirects,/\/assessment \/quick-scan 301/);
  assert.match(redirects,/\/prospect-workspace \/portal 301/);
});

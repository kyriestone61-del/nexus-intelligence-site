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

test('delivery boot uses the canonical owners and does not load the retired Phase Zero overlay',()=>{
  assert.match(portalApp,/const BUILD='20260908-relystra-continuous-journey1'/);
  assert.match(portalApp,/portal-delivery\.css/);
  assert.doesNotMatch(portalApp,/portal-phase-zero-lifecycle\.js/);
  assert.match(portalApp,/portal-admin-journey\.js/);
  assert.match(portalApp,/portal-client-shell-v2\.js/);
  assert.equal((portalApp.match(/requiredImport\(asset\(`portal-action-processing-engine\.js/g)||[]).length,2,'both role branches explicitly require governed Action processing');
  assert.ok(portalApp.lastIndexOf('portal-action-processing-engine.js')<portalApp.lastIndexOf('portal-admin-journey.js'));
  assert.match(portalApp,/window\.NexusAdminJourney\?\.navigate/);
});

test('client journey keeps future stages visible with canonical gates',()=>{
  for(const label of ['Overview','Diagnosis','Actions','Builds','Progress','Final Package','Support'])assert.ok(clientShell.includes(label));
  assert.match(clientShell,/journeyGate/);
  assert.match(clientShell,/journeyNext\(lifecycleStore\.value/);
  assert.match(clientShell,/mountPackageDelivery/);
});

test('admin portfolio and Decisions surfaces remain role-specific',()=>{
  assert.match(companies,/button\.dataset\.section='companies'/);
  assert.match(companies,/Portfolio operating view/);
  assert.match(companies,/Open workspace/);
  assert.match(inbox,/function founderDecisionsMode\(\)/);
  assert.match(inbox,/label=founderMode\?'Decisions':'Inbox'/);
  assert.match(inbox,/Approval & action routing/);
});

test('diagnosis approval routes into curated Actions and retains the old plan only outside the new lifecycle',()=>{
  const approval=readFileSync(new URL('../../portal-diagnosis-approval-ux.js',import.meta.url),'utf8');
  const bridge=readFileSync(new URL('../../portal-resolution-inline-approval-bridge.js',import.meta.url),'utf8');
  assert.match(approval,/if\(!window\.__relystraDeliveryLifecycle\)await import\('\/portal-resolution-plan/);
  assert.match(bridge,/NexusAdminJourney\?\.navigate\?\.\('actions'\)/);
});

test('Phase Zero UI makes verified measured client acceptance the finish line',()=>{
  for(const label of ['Understand','Diagnose','Agree & Pay','Kickoff','Build','Verify','Measure','Accept','Complete'])assert.match(lifecycle,new RegExp(label.replace('&','\\&')));
  assert.match(lifecycle,/Does the delivered result meet the agreed outcome\?/);
  assert.match(lifecycle,/Implementation, QA, measurement, handoff, and client acceptance are all recorded/);
});

test('final role simplification is event-driven without a body-wide reconciliation observer',()=>{
  assert.match(simplify,/function simplifyAdminNav\(\)/);
  assert.match(simplify,/function simplifyJourney\(\)/);
  assert.match(simplify,/function simplifyDecisions\(\)/);
  assert.match(simplify,/function simplifySales\(\)/);
  assert.match(simplify,/function simplifyClient\(\)/);
  assert.match(simplify,/Records & Tools/);
  assert.match(simplify,/window\.NexusProductionSimplification=\{apply,openDecisions\}/);
  assert.match(simplify,/window\.addEventListener\('nexus:workspace-ready',scheduleSettled\)/);
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

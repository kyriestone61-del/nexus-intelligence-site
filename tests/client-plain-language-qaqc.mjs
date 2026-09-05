import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync('portal-app.js','utf8');
const copy=fs.readFileSync('portal-client-plain-language.js','utf8');

assert.match(app,/const BUILD='[0-9]{8}-[A-Za-z0-9._-]+'/,'client portal must use a current dated cache-busting build id');
assert.match(app,/portal-client-plain-language\.js\?v=\$\{BUILD\}/,'plain-language layer must be loaded by the portal');
assert.ok(app.indexOf('portal-client.js?v=${BUILD}')<app.indexOf('portal-client-plain-language.js?v=${BUILD}'),'plain-language layer must load after base portal client initialization');
assert.ok(app.indexOf('portal-client-plain-language.js?v=${BUILD}')<app.indexOf('const portal=window.NexusPortal'),'auth and onboarding copy must be simplified before role-specific shells are selected');
assert.match(app,/window\.NexusClientPlainLanguage\?\.apply\?\.\(\)/,'client shell must explicitly reapply plain-language copy after shell modules load');

const expectedPairs=[
  ['Use one private workspace to prepare for discovery, exchange evidence, see responsibilities, make approvals, follow implementation, and measure what changed.','Use this private workspace to see what Relystra needs from you, upload files, answer questions, approve decisions, follow the work as it moves forward, and see the results.'],
  ['Your ordered actions and decisions.','See what you need to do next and any decisions waiting for you.'],
  ['Exactly what Relystra needs and why.','See exactly what files or information Relystra needs, why we need them, and where to upload them.'],
  ['Baseline → change → measured result.','See where things started, what changed, and what results were measured.'],
  ['Why Relystra Needs It','Why this matters'],
  ['What You Need to Provide','What to send or answer'],
  ['What Happens Afterward','What happens next'],
  ['No dependency-blocked actions.','Nothing is waiting on another step.'],
  ['Released findings.','Reports Relystra has shared with you.'],
  ['Preparation workspace','What Relystra needs from you'],
  ['Do the work here.','Complete these items here.'],
  ['CLIENT → RELYSTRA HANDOFF','WHEN YOU ARE FINISHED']
];
for(const [from,to] of expectedPairs){assert.ok(copy.includes(JSON.stringify(from).slice(1,-1))||copy.includes(from),`missing source copy mapping: ${from}`);assert.ok(copy.includes(JSON.stringify(to).slice(1,-1))||copy.includes(to),`missing plain-language replacement: ${to}`)}

assert.match(copy,/document\.body\.classList\.contains\('portal-client-mode'\)/,'workspace rewrites must be limited to client mode');
assert.match(copy,/\[data-prep-build\]/,'Build with Relystra control must receive a clearer client label');
assert.match(copy,/I do not have this — help me build it/,'missing-artifact action must use plain language');
assert.match(copy,/\[data-prep-na\]/,'not-applicable control must receive a clearer client label');
assert.match(copy,/This does not apply/,'not-applicable action must be clear');
assert.match(copy,/NodeFilter\.SHOW_TEXT/,'copy layer should rewrite text without replacing functional controls');
assert.match(copy,/observer\.observe\(document\.body,\{childList:true,subtree:true\}\)/,'dynamic client copy must be reapplied after shell rendering');
assert.equal(/service[_-]?role|SUPABASE_SERVICE|RESEND_API_KEY|TWILIO_AUTH_TOKEN|SECRET_KEY/.test(copy),false,'plain-language browser layer must not contain privileged credentials');

console.log('RELYSTRA CLIENT PLAIN-LANGUAGE QAQC PASS');

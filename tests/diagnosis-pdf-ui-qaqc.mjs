import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync('portal-app.js','utf8');
const ui=fs.readFileSync('portal-diagnosis-pdf-ui.js','utf8');
const backend=fs.readFileSync('functions/api/diagnosis-report-pdf.js','utf8');

const loaderMatches=app.match(/portal-diagnosis-pdf-ui\.js/g)||[];
assert.equal(loaderMatches.length,2,'diagnosis PDF UI must load in both client and admin shells');
assert.ok(app.indexOf('portal-client-shell-v2.js')<app.indexOf('portal-diagnosis-pdf-ui.js'),'client report UI must exist before PDF controls mount');
assert.ok(app.lastIndexOf('portal-diagnosis-review-ux.js')<app.lastIndexOf('portal-diagnosis-pdf-ui.js'),'admin diagnosis review UI must exist before PDF controls mount');

assert.match(ui,/sb\.auth\.getSession\(\)/,'downloads must use the signed-in user session');
assert.match(ui,/Authorization':`Bearer \$\{token\}`/,'PDF request must use bearer authentication');
assert.match(ui,/fetch\('\/api\/diagnosis-report-pdf'/,'UI must call the authenticated report endpoint');
assert.match(ui,/JSON\.stringify\(payload\)/,'request payload must stay explicit and server-authorized');
assert.match(ui,/\{run_id:id\}/,'admin download must request the internal diagnosis by run id');
assert.match(ui,/\{release_id:releaseId\}/,'client download must request the released client-safe report by release id');
assert.match(ui,/content-disposition/,'download must honor the server-provided attachment filename');
assert.match(ui,/application\/pdf/,'download must reject unexpected response types');
assert.match(ui,/URL\.revokeObjectURL/,'temporary blob URLs must be released');
assert.match(ui,/\.eq\('status','released'\)/,'client controls must only bind to released reports');
assert.match(ui,/\.is\('revoked_at',null\)/,'revoked reports must not receive client download controls');
assert.match(ui,/rows\.length!==cards\.length/,'client controls must fail closed if report order cannot be reconciled safely');
assert.match(ui,/Download full PDF/,'founder diagnosis review must expose the full PDF action');
assert.match(ui,/Download PDF/,'client report view must expose the client-safe PDF action');
assert.equal(/service[_-]?role|SUPABASE_SERVICE|RESEND_API_KEY|TWILIO_AUTH_TOKEN/.test(ui),false,'browser PDF controls must not contain privileged credentials');

assert.match(backend,/if\(body\.run_id\).*if\(!isAdmin\)throw new Error\('ADMIN_REQUIRED'\)/s,'full run PDF must remain administrator-only');
assert.match(backend,/else if\(body\.release_id\)/,'endpoint must expose a released-report path');
assert.match(backend,/report=release\.client_report;client=true/,'released PDF must use the client-safe projection');
assert.match(backend,/nexus_company_members\?company_id=/,'non-admin client access must be verified against active company membership');
assert.match(backend,/content-disposition/,'endpoint must return an attachment filename');
assert.match(backend,/'cache-control':'no-store'/,'diagnosis PDFs must not be cached');

console.log('NEXUS DIAGNOSIS PDF UI QAQC PASS');

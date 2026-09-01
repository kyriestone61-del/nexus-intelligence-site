import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync('portal-app.js','utf8');
const router=fs.readFileSync('portal-vnext-runtime-router.js','utf8');
const pdf=fs.readFileSync('functions/api/diagnosis-report-pdf.js','utf8');
const sms=fs.readFileSync('functions/api/sms-dispatch.js','utf8');
const workflow=fs.readFileSync('.github/workflows/email-dispatch.yml','utf8');

assert.match(app,/portal-vnext-runtime-router\.js/,'portal must load the free-plan delivery router');
assert.ok(app.indexOf('portal-vnext-runtime-router.js')<app.indexOf('portal-vnext-experience.js'),'runtime router must load before vNext experience');
assert.match(router,/nexus-diagnosis-report-pdf/);
assert.match(router,/\/api\/diagnosis-report-pdf/);
assert.match(router,/nexus-sms-worker/);
assert.match(router,/\/api\/sms-dispatch/);

assert.match(pdf,/SUPABASE_SERVICE_ROLE_KEY/);
assert.match(pdf,/\/auth\/v1\/user/,'PDF route must validate the caller token');
assert.match(pdf,/nexus_platform_admins/,'full report PDF must verify admin status');
assert.match(pdf,/nexus_company_members/,'client report PDF must verify company membership');
assert.match(pdf,/analysis_result/);
assert.match(pdf,/client_report/);
assert.match(pdf,/application\/pdf/);

assert.match(sms,/EMAIL_DISPATCH_SECRET/,'SMS scheduler should reuse the existing protected dispatch secret');
assert.match(sms,/\/auth\/v1\/user/,'interactive SMS flush must validate the admin token');
assert.match(sms,/nexus_platform_admins/);
assert.match(sms,/TWILIO_ACCOUNT_SID/);
assert.match(sms,/status:'unavailable'/,'missing SMS provider must be represented honestly');
assert.match(sms,/invalid_phone/);
assert.match(sms,/status:'sending'/);
assert.match(sms,/status:'sent'/);

assert.match(workflow,/\/api\/email-dispatch/);
assert.match(workflow,/\/api\/sms-dispatch/);
assert.match(workflow,/NEXUS_EMAIL_DISPATCH_SECRET/);

console.log('Nexus vNext free-plan runtime contracts passed.');

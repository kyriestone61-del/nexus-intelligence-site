import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync('portal-app.js','utf8');
const router=fs.readFileSync('portal-vnext-runtime-router.js','utf8');
const pdf=fs.readFileSync('functions/api/diagnosis-report-pdf.js','utf8');
const worker=fs.readFileSync('supabase/functions/nexus-email-worker/index.ts','utf8');

assert.match(app,/portal-vnext-runtime-router\.js/,'portal must load the free-plan delivery router');
assert.ok(app.indexOf('portal-vnext-runtime-router.js')<app.indexOf('portal-vnext-experience.js'),'runtime router must load before vNext experience');
assert.match(router,/nexus-diagnosis-report-pdf/);
assert.match(router,/\/api\/diagnosis-report-pdf/);
assert.match(router,/nexus-sms-worker/);
assert.match(router,/status:'scheduled'/,'browser SMS flush should hand off to the secured background worker');
assert.doesNotMatch(router,/\/api\/sms-dispatch/,'browser must not depend on the retired Cloudflare SMS endpoint');

assert.doesNotMatch(pdf,/SUPABASE_SERVICE_ROLE_KEY/,'PDF export must not require a Cloudflare service-role secret');
assert.match(pdf,/SUPABASE_PUBLISHABLE/);
assert.match(pdf,/\/auth\/v1\/user/,'PDF route must validate the caller token');
assert.match(pdf,/nexus_platform_admins/,'full report PDF must verify admin status');
assert.match(pdf,/nexus_company_members/,'client report PDF must verify company membership');
assert.match(pdf,/analysis_result/);
assert.match(pdf,/client_report/);
assert.match(pdf,/application\/pdf/);

assert.match(worker,/RESEND_API_KEY/);
assert.match(worker,/TWILIO_ACCOUNT_SID/);
assert.match(worker,/TWILIO_AUTH_TOKEN/);
assert.match(worker,/TWILIO_FROM_NUMBER/);
assert.match(worker,/nexus_email_outbox/);
assert.match(worker,/nexus_sms_outbox/);
assert.match(worker,/processEmail/);
assert.match(worker,/processSms/);
assert.match(worker,/SMS provider is not configured/,'missing SMS provider must be represented honestly');
assert.match(worker,/status:'unavailable'/);
assert.match(worker,/invalid_phone/);
assert.match(worker,/status:'sending'/);
assert.match(worker,/status:'sent'/);
assert.match(worker,/https:\/\/nexusintelligence\.live/,'notifications should link to the production Nexus origin');
assert.doesNotMatch(worker,/nexus-intelligence-v3-preview\.vercel\.app/,'notification links must not point at the retired preview origin');

assert.equal(fs.existsSync('functions/api/sms-dispatch.js'),false,'redundant Cloudflare SMS dispatcher should be removed');
assert.equal(fs.existsSync('.github/workflows/email-dispatch.yml'),false,'duplicate GitHub notification scheduler should be removed');

console.log('Nexus vNext consolidated delivery runtime contracts passed.');

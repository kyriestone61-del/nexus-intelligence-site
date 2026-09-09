import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read=path=>fs.readFileSync(path,'utf8');
const migration=read('supabase/migrations/20260908020000_relystra_launch_security_controls.sql');
const retirement=read('supabase/migrations/20260908023000_relystra_retire_unsafe_snapshot_rpc.sql');

test('public Snapshot intake stays behind a server boundary, is idempotent and quota-bound, and does not queue model work',()=>{
  const edge=read('functions/api/opportunity-snapshot.js'),gateway=read('supabase/functions/nexus-email-worker/public-request-gateway.ts');
  assert.match(edge,/SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(edge,/submit_relystra_opportunity_snapshot/);
  assert.match(edge,/snapshot-ip:/);
  assert.match(edge,/mode:'opportunity_snapshot'/);
  assert.match(gateway,/submit_relystra_opportunity_snapshot/);
  assert.match(gateway,/snapshot-ip:/);
  assert.match(migration,/unique\(submission_kind,dedupe_key\)/);
  assert.match(migration,/ip_recent>=12 or email_recent>=3 or global_recent>=120/);
  assert.match(retirement,/revoke all on function public\.submit_nexus_opportunity_snapshot\(jsonb\) from public,anon,authenticated/);
  assert.doesNotMatch(migration,/values\('generate_outreach_packet'/);
  assert.match(migration,/'email_unverified',true,'email_provided_by_prospect',false/);
});

test('recovery stays on the trusted queue and one-time tokens are removed before verification',()=>{
  const api=read('functions/api/auth-email.js'),worker=read('supabase/functions/nexus-email-worker/index.ts'),gateway=read('supabase/functions/nexus-email-worker/public-request-gateway.ts'),mail=read('supabase/functions/nexus-email-worker/auth-recovery.ts'),portal=read('portal-auth.js');
  assert.match(api,/queueRecoveryViaGateway/);
  assert.match(worker,/maybeHandlePublicRequest/);
  assert.equal(fs.existsSync('supabase/functions/nexus-email-worker/auth-recovery-request.ts'),false);
  assert.doesNotMatch(gateway,/body\?\.client_ip/);
  assert.match(gateway,/sourceIp\(req\)/);
  assert.match(mail,/target\.hash=new URLSearchParams/);
  assert.doesNotMatch(mail,/target\.searchParams\.set\('token_hash'/);
  assert.match(portal,/history\.replaceState\(\{\},'',`\$\{location\.pathname\}#mode=recovery`\);\s*const result=await sb\.auth\.verifyOtp/);
  assert.match(migration,/v_global_recent>=120/);
});

test('support and diagnosis model calls require atomic leases before provider spend',()=>{
  const edge=read('supabase/functions/nexus-diagnosis-execute/index.ts');
  assert.match(migration,/create table public\.relystra_support_turn_claims/);
  assert.match(migration,/create or replace function public\.relystra_claim_support_turn/);
  assert.match(migration,/p\.support_ends_at<=now\(\)/);
  assert.match(migration,/user_recent>=10 or company_recent>=50 or global_recent>=250/);
  assert.ok(edge.indexOf("relystra_claim_support_turn")<edge.indexOf("'Delivered-system support'"));
  assert.match(migration,/create or replace function public\.relystra_claim_diagnosis_execution/);
  assert.match(migration,/execution_lease_expires_at/);
  const diagnosisFlow=edge.slice(edge.indexOf('const initial='));
  assert.ok(diagnosisFlow.indexOf("relystra_claim_diagnosis_execution")<diagnosisFlow.indexOf('const cfg=await providerConfig();'));
  assert.match(edge,/relystra_complete_diagnosis_execution/);
  assert.match(edge,/relystra_fail_diagnosis_execution/);
  assert.match(edge,/request limit\|rate limit/);
  assert.match(edge,/\?429:/);
});

test('Office evidence parsing has compressed and expanded resource budgets',()=>{
  const edge=read('supabase/functions/nexus-diagnosis-execute/index.ts');
  for(const marker of ['MAX_SOURCE_BYTES','MAX_ARCHIVE_ENTRIES','MAX_ARCHIVE_EXPANDED_BYTES','MAX_ARCHIVE_RATIO','MAX_WORKBOOK_CELLS','safeOfficeZip'])assert.match(edge,new RegExp(marker));
  assert.match(edge,/FILE_SIZE_LIMIT/);
  assert.match(edge,/OFFICE_ARCHIVE_EXPANSION_LIMIT/);
  assert.match(edge,/WORKBOOK_CELL_LIMIT/);
});

test('retired first-party booking and discovery endpoints cannot be deployed',()=>{
  for(const path of ['book.html','booking-manage.html','functions/_lib/google-calendar.js','functions/api/booking-availability.js','functions/api/booking-create.js','functions/api/booking-manage.js','functions/api/discovery-request.js'])assert.equal(fs.existsSync(path),false,path);
  assert.match(read('_redirects'),/\/book https:\/\/calendar\.app\.google\//);
});

test('Pages middleware applies response security headers and public indexing is enabled',()=>{
  const middleware=read('functions/_middleware.js'),headers=read('_headers'),robots=read('robots.txt');
  for(const marker of ['Content-Security-Policy','X-Content-Type-Options','Referrer-Policy','X-Frame-Options','Permissions-Policy'])assert.match(middleware,new RegExp(marker));
  assert.doesNotMatch(headers.split('\n').slice(0,9).join('\n'),/X-Robots-Tag/);
  assert.match(robots,/Allow: \//);
  assert.match(robots,/Sitemap:/);
  assert.match(middleware,/meta\[name="robots"\]/);
});

test('administrator client invitation grants one-company membership and queues a tokenless email',()=>{
  const api=read('functions/api/invite-client.js'),gateway=read('supabase/functions/nexus-email-worker/public-request-gateway.ts'),worker=read('supabase/functions/nexus-email-worker/auth-recovery.ts'),ui=read('portal-admin-intake.js');
  assert.match(api,/nexus_platform_admins/);
  assert.match(api,/relystra_queue_client_invite/);
  assert.match(api,/mode:'invite_client'/);
  assert.match(gateway,/nexus_platform_admins/);
  assert.match(gateway,/relystra_queue_client_invite/);
  assert.match(migration,/on conflict\(company_id,user_id\) do update/);
  assert.match(migration,/'auth_invite'/);
  assert.match(migration,/'token_persisted',false/);
  assert.match(worker,/type:'magiclink'/);
  assert.match(worker,/firstPartyAuthLink\(actionLink,'magiclink','invite'\)/);
  assert.match(ui,/clientInviteForm/);
});

test('email status reports the actual scheduled worker and future live delivery setting',()=>{
  const api=read('functions/api/email-status.js');
  assert.match(api,/relystra_email_delivery_status/);
  assert.match(migration,/check_name='email_delivery'/);
  assert.match(migration,/delivery_emails_enabled=true/);
});

import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const migration=await readFile(new URL('../supabase/migrations/20260905_relystra_phase_zero_client_lifecycle.sql',import.meta.url),'utf8');
const portalApp=await readFile(new URL('../portal-app.js',import.meta.url),'utf8');
const lifecycle=await readFile(new URL('../portal-phase-zero-lifecycle.js',import.meta.url),'utf8');
const resolution=await readFile(new URL('../portal-resolution-plan.js',import.meta.url),'utf8');

const stages=['discovery','diagnosis','commercial','onboarding','implementation','verification','measurement','acceptance','complete'];
const gates=['scope_signed','payment_confirmed','onboarding_complete','implementation_complete','qa_passed','measurement_complete','handoff_complete','client_accepted'];

test('Phase Zero defines the complete Point A to Point B lifecycle',()=>{
  for(const stage of stages)assert.match(migration,new RegExp(`'${stage}'`),`missing stage ${stage}`);
  assert.match(migration,/Engagement stages cannot be skipped/);
  assert.match(migration,/Backward stage movement requires an explicit override/);
});

test('commercial close freezes implementation until scope and payment pass',()=>{
  assert.match(resolution,/nexus_phase_zero_confirm_resolution_plan/);
  assert.doesNotMatch(resolution,/sb\.rpc\('nexus_confirm_resolution_plan'/);
  assert.match(migration,/engagement_stage='commercial'/);
  assert.match(migration,/implementation_released',false/);
  assert.match(migration,/scope_signed/);
  assert.match(migration,/payment_confirmed/);
  assert.match(migration,/status='not_started',notify_client=false/);
});

test('all Phase Zero gates are authoritative database records',()=>{
  assert.match(migration,/create table if not exists public\.nexus_engagement_gate_records/);
  for(const gate of gates)assert.match(migration,new RegExp(`'${gate}'`),`missing gate ${gate}`);
  assert.match(migration,/unique\(project_id,gate_code\)/);
  assert.match(migration,/enable row level security/);
  assert.match(migration,/revoke insert,update,delete on public\.nexus_engagement_gate_records from authenticated/);
});

test('implementation cannot be declared complete with open governed work',()=>{
  assert.match(migration,/Implementation cannot close while % governed action\(s\) remain open/);
  assert.match(migration,/source_resolution_proposal_id is not null/);
  assert.match(migration,/status not in \('completed','approved','done','not_applicable','cancelled','canceled'\)/);
});

test('measurement is required before acceptance',()=>{
  assert.match(migration,/Measurement cannot close until at least one post-implementation result is recorded/);
  assert.match(migration,/current_value is not null and m\.measured_at is not null/);
  assert.match(migration,/actual_result/);
  assert.match(migration,/engagement_stage='acceptance'/);
});

test('client acceptance cannot be impersonated by the generic admin gate recorder',()=>{
  assert.match(migration,/if v_gate not in \('scope_signed','payment_confirmed','onboarding_complete','implementation_complete','qa_passed','measurement_complete','handoff_complete'\)/);
  assert.match(migration,/create or replace function public\.nexus_client_accept_engagement/);
  assert.match(migration,/nexus_is_company_member\(p\.company_id\)/);
  assert.match(migration,/This engagement is not ready for final acceptance/);
  assert.match(migration,/p_decision.*accepted.*changes_requested/s);
});

test('external acceptance fallback requires a written evidence reference',()=>{
  assert.match(migration,/create or replace function public\.nexus_admin_record_external_client_acceptance/);
  assert.match(migration,/Written acceptance evidence reference is required/);
  assert.match(migration,/external_written_acceptance/);
});

test('completion requires both handoff and client acceptance',()=>{
  const closeBlock=/engagement_stage='acceptance'[\s\S]*?handoff_complete[\s\S]*?client_accepted[\s\S]*?engagement_stage='complete'/;
  assert.match(migration,closeBlock);
  assert.match(migration,/status='complete'/);
});

test('portal exposes a simple lifecycle in both client and admin shells',()=>{
  assert.match(portalApp,/portal-phase-zero-lifecycle\.css/);
  assert.equal((portalApp.match(/portal-phase-zero-lifecycle\.js/g)||[]).length,2);
  for(const label of ['Understand','Diagnose','Agree & Pay','Kickoff','Build','Verify','Measure','Accept','Complete'])assert.match(lifecycle,new RegExp(label.replace('&','\\&')));
  assert.match(lifecycle,/nexus_get_phase_zero_status/);
  assert.match(lifecycle,/nexus_admin_record_engagement_gate/);
  assert.match(lifecycle,/nexus_client_accept_engagement/);
  assert.match(lifecycle,/nexus_admin_record_external_client_acceptance/);
});

test('client-facing copy makes measured acceptance the finish line',()=>{
  assert.match(lifecycle,/does not treat work as complete just because implementation finished/);
  assert.match(lifecycle,/Does the delivered result meet the agreed outcome\?/);
  assert.match(lifecycle,/Engagement complete/);
});

test('browser lifecycle modules contain no privileged server credentials',()=>{
  const browser=lifecycle+'\n'+resolution+'\n'+portalApp;
  assert.doesNotMatch(browser,/SUPABASE_SERVICE_ROLE|SERVICE_ROLE_KEY|RESEND_API_KEY|AI_GATEWAY_API_KEY|STRIPE_SECRET/i);
});

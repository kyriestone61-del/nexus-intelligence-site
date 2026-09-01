import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const app=readFileSync('portal-app.js','utf8');
const model=readFileSync('portal-buildingblok-cohesion.js','utf8');
const css=readFileSync('portal-buildingblok-cohesion.css','utf8');
const migration=readFileSync('supabase/migrations/20260901_nexus_evidence_lineage_and_action_instructions.sql','utf8');

test('portal boots the mobile hardening and unified operating model',()=>{
  assert.match(app,/portal-mobile-hardening\.css/);
  assert.match(app,/portal-buildingblok-cohesion\.css/);
  assert.match(app,/portal-buildingblok-cohesion\.js/);
  assert.match(app,/Companies, Inbox and mobile operating model/);
});

test('Companies provides the three canonical lifecycle labels',()=>{
  assert.match(model,/Initiation \/ Intake/);
  assert.match(model,/In Progress \/ Active/);
  assert.match(model,/Complete \/ Archived/);
  assert.match(model,/data-section="companies"/);
  assert.match(model,/nexus_active_engagements/);
});

test('admin Companies supports portfolio search and company switching',()=>{
  assert.match(model,/nexusCompanySearch/);
  assert.match(model,/nexusCompanyLifecycle/);
  assert.match(model,/view_mode=admin&company=/);
  assert.match(model,/view_mode=client&company=/);
});

test('Inbox gains company, type, status and text filtering without replacing canonical Inbox',()=>{
  assert.match(model,/nexusInboxSearch/);
  assert.match(model,/nexusInboxCompany/);
  assert.match(model,/nexusInboxType/);
  assert.match(model,/nexusInboxStatus/);
  assert.match(model,/nexusInboxRoot/);
});

test('mobile navigation is explicitly collapsible',()=>{
  assert.match(model,/nexusMobileNavToggle/);
  assert.match(css,/nexus-mobile-nav-collapsed/);
  assert.match(css,/@media\(max-width:760px\)/);
});

test('client evidence actions can be submitted to Nexus after upload',()=>{
  assert.match(model,/Submit evidence for review/);
  assert.match(model,/nexus_submit_task_for_review/);
  assert.match(model,/evidence_submission/);
  assert.match(model,/Uploading alone does not mark the action complete/);
});

test('ambiguous engagement cannot silently accept evidence',()=>{
  assert.match(model,/nexusUploadProjectGuard/);
  assert.match(model,/Select or resolve one active engagement before uploading/);
  assert.doesNotMatch(model,/state\.projects\?\.\[0\]/);
});

test('database enforces evidence lineage and fills diagnosis action instructions',()=>{
  assert.match(migration,/nexus_validate_document_lineage/);
  assert.match(migration,/Document data requirement must belong to the same project/);
  assert.match(migration,/nexus_default_task_instructions/);
  assert.match(migration,/task_type='diagnosis_action'/);
});

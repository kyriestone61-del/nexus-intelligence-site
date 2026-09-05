import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync('portal-app.js','utf8');
const actions=fs.readFileSync('portal-action-execution-v2.js','utf8');
const cohesion=fs.readFileSync('portal-buildingblok-cohesion.js','utf8');

test('rich Action Items runtime is not imported with its 900ms reconciliation disabled',()=>{
  assert.ok(app.includes("requiredImport(asset(`portal-action-execution-v2.js?v=${BUILD}`),'action execution')"));
  assert.ok(!app.includes("portal-action-execution-v2.js?v=${BUILD}`),[900]"));
});

test('client action cards retain details, response, submit, and Relystra review controls',()=>{
  for(const token of ['task-detail-toggle','data-client-note','client-submit-task','admin-approve-task','admin-revise-task']) assert.ok(actions.includes(token),token);
  assert.ok(actions.includes("nexus_submit_task_for_review"));
  assert.ok(actions.includes("nexus_approve_task"));
  assert.ok(actions.includes("nexus_request_task_revision"));
});

test('evidence tasks can submit evidence for Relystra review rather than only opening Files',()=>{
  assert.ok(cohesion.includes('Submit evidence for review'));
  assert.ok(cohesion.includes('submitEvidenceTask'));
  assert.ok(cohesion.includes('nexus_submit_task_for_review'));
});

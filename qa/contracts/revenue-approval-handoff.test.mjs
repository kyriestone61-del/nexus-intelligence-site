import fs from 'node:fs';
import assert from 'node:assert/strict';

const handoffFile='supabase/migrations/20260901_nexus_revenue_first_touch_approval_deadlock_fix.sql';
const dueFile='supabase/migrations/20260901_nexus_revenue_followup_due_gate.sql';
const handoff=fs.readFileSync(handoffFile,'utf8');
const due=fs.readFileSync(dueFile,'utf8');

assert.match(handoff,/NEW\.status<>'pending_approval' OR NEW\.step_no=1/,
  'Email 1 must not receive a second outreach_step approval chain');
assert.match(handoff,/nexus_require_entity_chain_approved\('outreach_packet',v_packet_id\)/,
  'Email 1 send-readiness must inherit the approved packet gate');
assert.match(handoff,/nexus_require_entity_chain_approved\('outreach_step',NEW\.id\)/,
  'Follow-up send-readiness must retain its own approval gate');
assert.match(handoff,/s\.step_no=1[\s\S]*c\.status IN \('draft','pending','changes_requested'\)/,
  'Previously active first-touch step chains must be retired without deleting audit history');
assert.doesNotMatch(handoff,/DELETE FROM public\.nexus_approval_(chains|events|chain_steps)/i,
  'The repair must preserve approval audit history');

assert.match(due,/IF v\.step_no=2 THEN/,
  'The send boundary must explicitly distinguish the follow-up step');
assert.match(due,/IF now\(\) < v\.due_at THEN/,
  'Email 2 must be blocked before its scheduled due_at timestamp');
assert.match(due,/Follow-up cannot be sent before its scheduled due date/,
  'Early follow-up sends must fail visibly');
assert.match(due,/due_at=now\(\)\+interval '3 days'/,
  'Email 1 send must continue creating the +3-day follow-up due date');

console.log('PASS revenue approval handoff and follow-up due contract');

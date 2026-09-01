import fs from 'node:fs';
import assert from 'node:assert/strict';

const file='supabase/migrations/20260901_nexus_revenue_first_touch_approval_deadlock_fix.sql';
const sql=fs.readFileSync(file,'utf8');

assert.match(sql,/NEW\.status<>'pending_approval' OR NEW\.step_no=1/,
  'Email 1 must not receive a second outreach_step approval chain');
assert.match(sql,/nexus_require_entity_chain_approved\('outreach_packet',v_packet_id\)/,
  'Email 1 send-readiness must inherit the approved packet gate');
assert.match(sql,/nexus_require_entity_chain_approved\('outreach_step',NEW\.id\)/,
  'Follow-up send-readiness must retain its own approval gate');
assert.match(sql,/s\.step_no=1[\s\S]*c\.status IN \('draft','pending','changes_requested'\)/,
  'Previously active first-touch step chains must be retired without deleting audit history');
assert.doesNotMatch(sql,/DELETE FROM public\.nexus_approval_(chains|events|chain_steps)/i,
  'The repair must preserve approval audit history');

console.log('PASS revenue first-touch approval handoff contract');

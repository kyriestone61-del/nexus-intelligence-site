import fs from 'node:fs';
import assert from 'node:assert/strict';

const sql=fs.readFileSync('supabase/migrations/20260901_nexus_snapshot_founder_decision_domain_fix.sql','utf8');

assert.match(sql,/INSERT INTO public\.nexus_founder_decision_queue[\s\S]*'pipeline'/,
  'Qualified Snapshot review must route to the governed pipeline decision domain');
assert.doesNotMatch(sql,/nexus_founder_decision_queue[\s\S]{0,500}VALUES\(\s*'lead'/i,
  'Snapshot trigger must not use the invalid lead decision domain');
assert.match(sql,/lead_readiness=readiness/,
  'Snapshot readiness classification must be preserved');
assert.match(sql,/marketing_opt_in_at/,
  'Snapshot marketing consent timestamp behavior must be preserved');
assert.match(sql,/snapshot_result/,
  'Personalized Snapshot result queueing must be preserved');
assert.match(sql,/snapshot-followup-1:/,
  'Opt-in nurture sequence must be preserved');

console.log('PASS Snapshot founder-decision domain contract');

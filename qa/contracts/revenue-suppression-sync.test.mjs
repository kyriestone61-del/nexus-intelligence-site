import assert from 'node:assert/strict';
import fs from 'node:fs';

const hotfix=fs.readFileSync('supabase/migrations/20260831_nexus_revenue_flywheel_07_suppression_sync.sql','utf8');
assert.match(hotfix,/nexus_revenue_lead_suppression_exception_sync/);
assert.match(hotfix,/after update of do_not_contact,suppression_reason/i);
assert.match(hotfix,/nexus_classify_revenue_lead_exceptions\(new\.id\)/);
console.log('Revenue suppression exception sync contract passed.');

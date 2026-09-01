import assert from 'node:assert/strict';
import fs from 'node:fs';

const hotfix=fs.readFileSync('supabase/migrations/20260831_nexus_revenue_flywheel_08_cascade_delete_guard.sql','utf8');
assert.match(hotfix,/tg_op='DELETE'/i);
assert.match(hotfix,/exists\(select 1 from public\.nexus_revenue_leads where id=old\.lead_id\)/i);
assert.match(hotfix,/nexus_recalculate_revenue_lead_score\(old\.lead_id\)/i);
assert.match(hotfix,/return old/i);
console.log('Revenue cascade delete guard contract passed.');

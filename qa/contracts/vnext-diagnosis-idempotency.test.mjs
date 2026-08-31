import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql=fs.readFileSync('supabase/migrations/20260831_nexus_diagnosis_qa_idempotency.sql','utf8');

assert.match(sql,/v_q\.status='answered' AND btrim\(coalesce\(v_q\.answer,''\)\)=v_answer/,'identical answered retries must be no-ops');
assert.match(sql,/RETURN v_q\.id;/,'idempotent retry must return the existing question id');
assert.match(sql,/digest\(v_answer,'sha256'\)/,'notification dedupe must be content-stable rather than time-based');
assert.doesNotMatch(sql,/extract\(epoch from now\(\)\)/,'time-based notification dedupe would permit duplicate retries');

console.log('Nexus diagnosis Q&A idempotency contract passed.');

import assert from 'node:assert/strict';
import fs from 'node:fs';

const worker=fs.readFileSync('supabase/functions/nexus-email-worker/index.ts','utf8');
assert.match(worker,/Missing decision-maker identity, missing\/unusable email, required human approval, or other downstream send-readiness issues are NOT packet-generation blockers/i);
assert.match(worker,/outreach_evidence_warning/);
assert.ok(!/OUTREACH_EVIDENCE_BLOCKED/.test(worker),'Evidence Strategist warnings must not hard-block packet generation after deterministic gates pass');
assert.match(worker,/CRITICAL_LEAD_EXCEPTION/,'critical deterministic exceptions must still block generation');
assert.match(worker,/NO_VERIFIED_PERSONALIZATION_HOOK/,'lack of verified personalization evidence must still block drafting');
assert.ok(!/notifyAdminsPacket/.test(worker),'prospect packet routing must use Founder Decision Queue rather than invalid client notifications');
console.log('Revenue packet generation gate contract passed.');

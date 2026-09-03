import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync('portal-app.js','utf8');
const editor=fs.readFileSync('portal-diagnosis-report-editor.js','utf8');
const controls=fs.readFileSync('supabase/migrations/20260903152000_nexus_founder_report_controls_and_onboarding.sql','utf8');
const display=fs.readFileSync('supabase/migrations/20260903152500_nexus_client_report_display_shape.sql','utf8');

assert.match(app,/portal-diagnosis-review-ux\.js[\s\S]*portal-diagnosis-report-editor\.js[\s\S]*portal-diagnosis-pdf-ui\.js/,'founder report editor must mount after diagnosis review and before PDF controls');
assert.match(editor,/nexus_preview_diagnosis_client_report/,'editor must render the server-authoritative client preview');
assert.match(editor,/nexus_add_diagnosis_report_adjustment/,'editor must save audited adjustments through an admin RPC');
assert.match(editor,/nexus_revoke_diagnosis_report_adjustment/,'editor must support undo without mutating the AI diagnosis');
assert.match(editor,/Hide from client/,'founder must be able to remove an AI recommendation from the client report');
assert.match(editor,/Add recommendation/,'founder must be able to add a recommendation the AI missed');
assert.match(editor,/Save wording/,'founder must be able to rewrite client-facing opportunity language');
assert.match(editor,/Save first move/,'founder must be able to change the recommended first move');
assert.doesNotMatch(editor,/analysis_result\s*:/,'browser editor must never overwrite the raw diagnosis result');
assert.doesNotMatch(editor,/service[_-]?role|SUPABASE_SERVICE|SECRET_KEY|TWILIO_AUTH_TOKEN/,'browser editor must not contain privileged credentials');

assert.match(controls,/create table if not exists public\.nexus_diagnosis_report_adjustments/,'migration must persist founder adjustments separately from the diagnosis');
assert.match(controls,/alter table public\.nexus_diagnosis_report_adjustments enable row level security/,'adjustment audit table must use RLS');
assert.match(controls,/using \(public\.nexus_is_platform_admin\(\)\)/,'only platform admins may select report adjustments');
assert.match(controls,/public\.nexus_effective_client_report/,'release path must compose an effective client report');
assert.match(controls,/v_report:=public\.nexus_client_report_projection\(v_result\)/,'client report must begin from the existing client-safe server projection');
assert.match(controls,/diagnosis_report_adjusted/,'founder changes must be written to the Nexus activity log');
assert.match(controls,/diagnosis_report_adjustment_revoked/,'undo actions must be auditable');
assert.match(controls,/nexus_company_member_onboarding_notice/,'newly activated company members must receive a one-time onboarding notification');
assert.match(controls,/Your Nexus workspace is ready/,'onboarding copy must explain that the workspace is ready');
assert.match(controls,/canonical_state='WAITING_ON_YOU'/,'onboarding must surface a real ready next step when one exists');
assert.doesNotMatch(controls,/update\s+public\.nexus_diagnosis_runs\s+set\s+analysis_result/i,'migration must preserve the immutable AI analysis');
assert.doesNotMatch(controls,/grant\s+(insert|update|delete).*nexus_diagnosis_report_adjustments.*authenticated/i,'authenticated browsers must not receive direct write grants to the adjustment table');

assert.match(display,/public\.nexus_client_report_display_shape/,'released reports must use a deliberate browser-facing shape');
assert.match(display,/'opportunities',coalesce\(v_report->'opportunity_backlog'/,'ranked AI opportunities must be visible in the client report');
assert.match(display,/'next_steps',v_report->'smallest_safe_pilot'/,'recommended first move must be visible as next steps');
assert.match(display,/'client_actions',coalesce\(v_report->'client_action_items'/,'client action items must survive serialization');
assert.match(display,/nexus_client_report_display_shape\(public\.nexus_effective_client_report\(v_run\.id\)\)/,'release must freeze the founder-reviewed report in client-display shape');
assert.match(display,/update public\.nexus_diagnosis_report_releases[\s\S]*nexus_client_report_display_shape\(client_report\)/,'historical released reports must be repaired without re-releasing or notifying clients');

console.log('NEXUS FOUNDER REPORT REVIEW + ONBOARDING QAQC PASS');

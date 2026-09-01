import assert from 'node:assert/strict';
import fs from 'node:fs';

const schema=fs.readFileSync('supabase/migrations/20260831_nexus_revenue_flywheel_01_schema.sql','utf8');
const logic=fs.readFileSync('supabase/migrations/20260831_nexus_revenue_flywheel_02_logic.sql','utf8');
const agents=fs.readFileSync('supabase/migrations/20260831_nexus_revenue_flywheel_03_agents.sql','utf8');
const controls=fs.readFileSync('supabase/migrations/20260831_nexus_revenue_flywheel_04_release_controls.sql','utf8');
const ops=fs.readFileSync('supabase/migrations/20260831_nexus_revenue_flywheel_05_ops_handoffs.sql','utf8');
const worker=fs.readFileSync('supabase/functions/nexus-email-worker/index.ts','utf8');

for(const table of [
  'nexus_revenue_leads','nexus_lead_research_evidence','nexus_revenue_agent_jobs',
  'nexus_outreach_packets','nexus_outreach_sequence_steps','nexus_lead_exceptions',
  'nexus_flywheel_requirement_checks','nexus_flywheel_execution_log'
]) assert.match(schema,new RegExp(`create table if not exists public\\.${table}`,'i'),`missing ${table}`);
assert.match(schema,/alter table public\.%I enable row level security/i);
assert.match(schema,/nexus_is_platform_admin\(\)/);
assert.match(schema,/grant select,insert,update,delete on public\.%I to service_role/i);

// Deterministic score contract supplied by the user.
assert.match(logic,/v_score:=v_score-30/,'response time >2h must deduct 30');
assert.equal((logic.match(/v_score:=v_score-20/g)||[]).length,2,'booking and review bottleneck must each deduct 20');
assert.match(logic,/v_response>120/);
assert.match(logic,/not v_booking/);
assert.match(logic,/evidence_type='review_bottleneck'/);
assert.match(logic,/v_score<=50/);
assert.match(logic,/generate_outreach_packet/);
assert.match(logic,/on conflict do nothing/,'re-scoring must not duplicate active jobs');
assert.match(logic,/score_confidence=round\(\(v_known::numeric\/3\)\*100,2\)/);

for(const code of ['missing_business_email','contact_provenance_missing','insufficient_scoring_evidence','stale_research','unsupported_revenue_estimate','jurisdiction_review','suppressed']) assert.ok(logic.includes(code),`missing exception ${code}`);
assert.match(logic,/if new\.do_not_contact then/);
assert.match(logic,/set status='cancelled'/);
assert.match(logic,/new\.stage:='suppressed'/);

assert.match(logic,/nexus_sync_opportunity_snapshot_to_revenue/);
assert.match(logic,/website_opportunity_snapshot/);
assert.match(logic,/source_snapshot_lead_id/);

// Live approval/release controls.
assert.match(controls,/nexus_revenue_lead_contactable/);
assert.match(controls,/qa_status='passed'/,'human cannot approve a packet that failed independent QA');
assert.match(controls,/nexus_admin_approve_outreach_step/,'follow-up needs its own explicit approval path');
assert.match(controls,/status <> 'approved_ready'/,'send marking must require explicit approval');
assert.match(controls,/now\(\)\+interval '3 days'/,'Email 2 becomes due three days after Email 1 is sent');
assert.match(controls,/step_no=2 and status='waiting'/);
assert.match(logic,/security_invoker=true/,'operations view must preserve caller RLS');

// Operations/Cohesion hardening: a prospect is not a client company yet.
assert.match(ops,/business_contact_verified/);
assert.match(ops,/inbound_request/);
assert.match(ops,/website_opportunity_snapshot/);
assert.match(ops,/marketing_opt_in/);
assert.match(ops,/nexus_founder_decision_queue/,'prospect review must route to the founder queue');
assert.match(ops,/'pipeline'/);
assert.match(ops,/outreach_packet:/);
assert.match(ops,/No prospect contact occurs automatically/);

for(const agent of [
  'lead_generation_scoring','personalized_outreach','lead_exception_classifier','retainer_fulfillment',
  'revenue_ops_cohesion','requirements_coverage_auditor','execution_compliance_auditor'
]) assert.ok(agents.includes(`'${agent}'`),`missing agent ${agent}`);
for(const existing of ['solution_architect','managed_operations','client_success','roi_measurement','ai_ops_observer','qa_governance','executive_orchestrator']) assert.ok(agents.includes(existing),`retainer/control workflow must coordinate existing ${existing}`);
for(const flow of ['revenue_lead_intake_scoring','qualified_outreach_packet','revenue_exception_triage','retainer_fulfillment_loop','revenue_flywheel_control_review']) assert.ok(agents.includes(`'${flow}'`),`missing workflow ${flow}`);
assert.match(agents,/'qualified_outreach_packet'[\s\S]*?'ai_assisted','testing'/);
assert.match(agents,/'retainer_fulfillment_loop'[\s\S]*?'ai_assisted','testing'/);
assert.match(agents,/\$2,500–\$5,000\/mo/);
assert.match(agents,/optional Grok\/Claude\/Synthesia adapters/);
assert.match(agents,/optional CrewAI\/n8n adapters/);
assert.match(agents,/'revenue_qualifying_packet_coverage'[\s\S]*?'up'/);
assert.match(agents,/'revenue_stale_queue'[\s\S]*?'down'/);

for(const ref of ['REV-LGS-01','REV-LGS-02','REV-LGS-03','REV-LGS-04','REV-OUT-01','REV-OUT-02','REV-OUT-03','REV-OUT-04','REV-EXC-01','REV-EXC-02','REV-RET-01','REV-RET-02','REV-OPS-01','REV-COV-01','REV-CMP-01']) assert.ok(agents.includes(ref),`missing evaluation ${ref}`);
for(const code of ['A01','A02','A03','A04','A05','B01','B02','B03','C01','C02','C03','C04','C05','D01','D02','D03','E01','E02','F01','F02','G01','G02','H01','H02','I01','I02','J01','J02','J03','J04']) assert.ok(agents.includes(`'${code}'`),`coverage contract missing ${code}`);

// Existing 5-minute worker is reused; it drafts and queues but does not send cold outreach.
assert.match(worker,/processRevenueFlywheel/);
assert.match(worker,/nexus_claim_revenue_agent_jobs/);
assert.match(worker,/Number\(lead\.opportunity_score\)>50/);
assert.match(worker,/lead\.do_not_contact/);
assert.match(worker,/Evidence Strategist/);
assert.match(worker,/Hyper-Personalized Outreach Drafter/);
assert.match(worker,/Independent Outreach QA \/ Governance Verifier/);
assert.match(worker,/Final Outreach Composer/);
assert.match(worker,/Final Packet Independent Verifier/);
assert.match(worker,/finalVerification/);
assert.match(worker,/qa_status:finalVerification\?\.pass===true\?'passed':'failed'/);
assert.match(worker,/publishable=eq\.true&evidence_complete=eq\.true&client_authorized=eq\.true/,'Nexus proof must be publishable, evidence complete and client authorized');
assert.match(worker,/Never invent a form submission, response time, review, workflow detail, decision maker, email, employee count, revenue, revenue loss, Nexus client result, metric, quote or source/);
assert.match(worker,/NO_VERIFIED_PERSONALIZATION_HOOK/);
assert.match(worker,/status:'pending_approval'/);
assert.match(worker,/step_no:2,status:'waiting'/);
assert.ok(!/nexus_outreach_sequence_steps[\s\S]{0,300}resend\.com/i.test(worker),'revenue sequence must not be auto-sent by the generation worker');

console.log('Nexus revenue flywheel contract QA passed.');

# Nexus Revenue Flywheel — Source Command Coverage Map

This file is the human-readable companion to `nexus_flywheel_requirement_checks` and GitHub Issue #58.

| Source requirement | Implementation evidence | Verification evidence |
|---|---|---|
| <=50 trigger | `nexus_recalculate_revenue_lead_score`, Snapshot sync trigger | `REV-LGS-04`, revenue-flywheel contract QA |
| -30 response >2h | deterministic score RPC | `REV-LGS-01`, contract QA |
| -20 no booking | deterministic score RPC | `REV-LGS-01`, contract QA |
| -20 review bottleneck | deterministic score RPC | `REV-LGS-01`, contract QA |
| structured lead record | `nexus_revenue_leads` | schema/RLS QA |
| 30–60 sec teardown | revenue worker outreach schema | `REV-OUT-01`, contract QA |
| Email 1 | revenue worker outreach schema | `REV-OUT-01`, contract QA |
| Email 2 +3 days | sequence table + send RPC | `REV-OUT-04`, release-control QA |
| custom Snapshot/workflow preview | `snapshot_preview` | `REV-OUT-01` |
| no fabricated Nexus proof | publishable/evidence-complete/client-authorized case study filter | `REV-OUT-02`, final verifier |
| evidence-backed personalization | research evidence + claim map | `REV-OUT-01/03`, final verifier |
| exception classifier | `nexus_classify_revenue_lead_exceptions` | `REV-EXC-01/02` |
| urgency/summary/action/human approval | canonical lead model | schema/logic QA |
| optional Google Maps/LinkedIn/Hunter | agent allowed-tools adapter contract | requirements auditor |
| optional Grok/Claude/Synthesia | outreach allowed-tools adapter contract | requirements auditor |
| optional CrewAI/n8n | retainer allowed-tools adapter contract | requirements auditor |
| retainer $2.5k–$5k band | `retainer_fulfillment_loop` purpose/guard | `REV-RET-01/02` |
| managed operations | existing `managed_operations` agent in retainer workflow | workflow QA |
| ROI measurement | existing `roi_measurement` agent in retainer workflow | `REV-RET-01/02` |
| client success | existing `client_success` agent in retainer workflow | workflow QA |
| CAIOO orchestration | `executive_orchestrator` + control review workflow | requirements auditor |
| operations cohesion | `revenue_ops_cohesion` | `REV-OPS-01` |
| full requirement audit | `requirements_coverage_auditor` + requirement table | `REV-COV-01` |
| execution-plan audit | `execution_compliance_auditor` + execution log | `REV-CMP-01` |
| no autonomous outreach | admin approval/send RPCs; no sequence-to-email outbox automation | contract QA |
| suppression | do-not-contact trigger + live contactability re-check | `REV-EXC-02`, release-control QA |
| observability | `nexus_revenue_flywheel_health_v` + revenue KPIs | contract QA + production queries |

# Relystra — AI-Native Operating System

**Implementation standard:** August 30, 2026  
**Source blueprint:** *Relystra — AI Leverage Blueprint, Founder Operating System v1.0*  
**Status:** Foundation implemented; operating evidence gates intentionally remain open until demonstrated.

## 1. Purpose

Relystra is not being designed as a generic AI agency, prompt-engineering shop, or autonomous-agent demo. The operating target is a disciplined implementation and managed-operations company in which reasoning, software access, workflows, agents, memory, client software, tools, company management, and evidence loops reinforce one another.

The controlling doctrine is:

1. Business outcome first; technology second.
2. Manual or AI-assisted validation before deeper automation.
3. Deterministic logic for predictable rules; AI for language, extraction, classification, and synthesis.
4. Human approval at consequential boundaries.
5. Facts, assumptions, unknowns, evidence, and confidence remain distinguishable.
6. Every recurring workflow has an owner, completion condition, baseline/KPI, exception path, logging, and rollback/manual fallback.
7. No client-facing savings, revenue, or ROI claim is promoted from modeled assumptions into fact.
8. No new internal software spend is justified merely by novelty; a measurable bottleneck/value case comes first.
9. Client context is isolated by company and permissions.
10. Failed pilots, incidents, exceptions, and negative results remain visible and feed the improvement system.

## 2. Architecture implemented

The Relystra operating stack now has five shared planes rather than ten disconnected feature projects.

### A. Intelligence plane

- Company Canon
- Decision Register
- Fact / Hypothesis / Unknown operating standard
- Artifact templates and QA requirements
- Contractor workflow reference atlas
- Agent role charters and evaluation cases

### B. Control plane

- Platform-admin authorization
- Company-scoped RLS
- Client-visible flags for selected records
- System-of-record registry
- Read/write boundaries
- Approval boundaries
- Connector health state
- Workflow exception queue
- Agent permission ladder
- Founder Decision Queue
- Incident / CAPA records

### C. Execution plane

- System Cards
- Workflow Definitions
- Workflow Runs
- Business-completion flag separate from technical run success
- Workflow Exceptions
- Existing Relystra Hub Requests / Approvals / Tasks / Projects / Metrics / Automations

### D. Memory and proof plane

- Company Canon
- Client/company memory
- Memory Records with provenance and supersession
- Evidence Registry
- Experiments
- Improvement Ledger
- Existing metric records

### E. Management plane

- Ten-layer execution registry
- 15-item immediate action register
- 25-task automation candidate inventory
- Founder Decision Queue
- Actionable KPI definitions with response rules
- Daily / weekly / monthly / quarterly / architecture review snapshots
- Founder-only AI-Native Operations Console

## 3. Operating-state vocabulary

Relystra separates **built**, **tested**, **proven**, and **allowed**.

- `foundation_complete`: required schema/template/control exists. It does **not** prove operating value.
- `ready_for_test`: role/template/system is ready for evidence-generating evaluation.
- `in_progress`: implementation exists but the blueprint's done-when evidence is incomplete.
- `gated`: deliberately blocked until a prerequisite is demonstrated.
- `completed`: the action's stated evidence standard has actually been met.
- Layer `gate_passed=true`: reserved for demonstrated layer-level operating evidence. Database infrastructure alone cannot set this legitimately.

All ten layer gates initially remain unpassed.

---

# Layer 01 — Think: Strategic Intelligence & Diagnosis

## Implemented

- `nexus_canon_records` stores approved operating truth and supersession metadata.
- `nexus_decision_register` stores decision, facts, assumptions, unknowns, evidence references, rejected alternatives, confidence, and next verification.
- `nexus_artifact_templates` includes:
  - Prospect Research Brief
  - Discovery Analysis
  - Process Map
  - Opportunity Scorecard
  - Readiness Scorecard
  - ROI Assumptions Sheet
  - Architecture Decision Memo
  - Red-Team Checklist
- Five contractor/construction-adjacent workflow reference models exist in `nexus_memory_records` as **draft reusable-pattern hypotheses**, not client facts:
  1. Estimate & Proposal Follow-Up
  2. Lead → Qualification → Estimate Handoff
  3. Project Administration / Change & Document Routing
  4. Owner Reporting / Weekly Operating Visibility
  5. Customer Communication / Scheduling / Intake
- Each reference model has candidate KPIs, likely failure modes, and required evidence/artifacts.

## Required decision path

Every material diagnosis should follow:

`Authorized evidence → facts/client statements/inferences/unknowns → current process → baseline → multiple solution classes → scoring → red-team → smallest falsifiable pilot → executive recommendation → evidence that would change the recommendation`

The solution-class comparison must include:

1. Leave as-is
2. Ordinary process improvement
3. Deterministic automation
4. AI-assisted workflow
5. Managed operation
6. Bounded agent approach

## Gate still open

The layer is not considered passed until live diagnostics demonstrate traceability, baseline/owner/KPI/acceptance criteria for the top recommendation, AI restraint, and post-engagement predicted-vs-actual calibration.

---

# Layer 02 — Create: Asset & System Production

## Implemented

Fifteen approved artifact templates exist in the registry:

1. Prospect Research Brief
2. Discovery Analysis
3. Process Map
4. Opportunity Scorecard
5. Readiness Scorecard
6. ROI Assumptions Sheet
7. Architecture Decision Memo
8. Red-Team Checklist
9. Proposal / Scope
10. System Card
11. Workflow Specification
12. QA / Acceptance Test Plan
13. Training & Adoption Guide
14. Managed Operations / Executive Pulse
15. Case Study / Evidence Asset

Each template includes required sections and explicit QA checks. AI-produced client artifacts remain drafts until the appropriate QA gate is complete.

The System Card standard captures:

- purpose
- trigger
- inputs
- outputs
- owner
- AI role
- deterministic logic
- human approvals
- exception classes
- logging
- operating-cost note
- KPI
- rollback
- acceptance criteria
- version/status

The existing public AI Opportunity Snapshot is documented as the first real end-to-end Relystra System Card.

## Gate still open

Template coverage and cycle-time gains must be observed over repeated real use. QA escape rate and reuse cannot be claimed from the existence of templates alone.

---

# Layer 03 — Operate Software: AI as the Coordination Layer

## Implemented

`nexus_system_registry` creates an explicit system map. Current internal entries include:

- Relystra Hub / Supabase
- Gmail
- Google Calendar
- Google Drive / Files
- HubSpot
- GitHub
- Cloudflare Pages
- ChatGPT / Work
- Vercel rollback path

Each system record can carry:

- category/purpose
- system-of-record responsibility
- owner
- sensitivity
- read permission
- write permission
- approval boundary
- data freshness
- connector status
- health review timestamp

`nexus_connector_health` records health checks rather than assuming continuity.

## Permission doctrine

1. Read first.
2. Controlled write only after a stable workflow and schema exist.
3. Material external communication, payment/financial movement, access change, deletion, production deployment, pricing/scope, and contractual commitment stay human-gated.
4. Model confidence alone can never authorize a consequential write.
5. Stale/disconnected/partial sources must be surfaced.

## Gate still open

The layer needs repeated connector-health checks, reconstructable material writes, and evidence that client/meeting context can be retrieved quickly and correctly.

---

# Layer 04 — Automate: Repeatable Workflows

## Implemented

- `nexus_workflow_definitions`
- `nexus_workflow_runs`
- `nexus_workflow_exceptions`
- `nexus_automation_candidates`
- Existing AI Opportunity Snapshot recorded as a live workflow definition
- 25 recurring Relystra work candidates inventoried

The 25-candidate inventory includes:

- lead intake verification
- prospect research
- pre-fit context packet
- pipeline follow-up review
- meeting prep
- discovery recap
- process-map draft
- artifact request preparation
- client workspace setup
- onboarding status
- implementation status
- document/evidence request review
- QA evidence packet
- approval queue review
- workflow health review
- recurring client report
- exception classification
- proof capture
- case-study draft
- weekly operating review prep
- daily command brief prep
- tool review prep
- permission review prep
- deployment QA prep
- finance/capacity brief prep

No top-five automation selection has been fabricated. Baseline minutes/run, runs/month, and error/rework rates remain empty until measured.

## Workflow design contract

A workflow definition requires:

- exact trigger
- business completion condition
- owner
- steps classified as deterministic / AI / human
- data contract
- validation rules
- exception taxonomy
- baseline definition
- KPI definition
- rollback/manual fallback
- operating mode and version

A workflow run separately records `status` and `business_completed`. This prevents a successful API call from being mislabeled a successful business outcome.

## Gate still open

Before deeper automation, Relystra needs baseline measurements on the 25 candidates, manual SOP evidence, repeatable runs, visible exception classes, failure alerts, and business KPI movement.

---

# Layer 05 — Agents: Specialized Digital Roles

## Implemented role registry

Nine bounded role charters exist:

1. Prospect Intelligence
2. Meeting Prep
3. Client Diagnosis
4. QA / Governance
5. Solution Architect
6. ROI / Measurement
7. Managed Operations
8. Client Success
9. Executive Orchestrator

The first four are `shadow` / `draft_only`. The remaining roles are `gated` / `draft_only` until prerequisite operating systems exist.

Each role charter contains:

- mission
- allowed inputs
- allowed tools
- output contract
- prohibited actions
- escalation conditions
- owner
- evaluation threshold
- permission level
- operating mode

## Permission ladder

1. `draft_only`
2. `recommend`
3. `controlled_internal_write`
4. `approved_external_action`

The founder console requires recorded evaluation evidence before the first two promotions and **blocks approved external action in the foundation release**.

Current console promotion logic:

- Recommend: at least 3 recorded evaluations, pass rate at/above threshold, no recorded adversarial failure.
- Controlled internal write: at least 10 recorded evaluations, pass rate at/above threshold, no recorded adversarial failure, and still human-reviewed.
- External action: not promotable from the console in this foundation release.

## Evaluation backlog

Twenty-eight unevaluated cases are registered across the four first agents. They include normal, edge, ambiguous/adversarial, entity-disambiguation, stale-source, cross-client leakage, unsupported-ROI, no-baseline, missing rollback, unapproved permission promotion, and “API success ≠ business completion” cases.

`score` and `passed` remain null until each case is actually executed and reviewed.

## Gate still open

No agent permission expansion should occur until the representative evaluation set is executed and the pass/failure evidence is stored.

---

# Layer 06 — Institutional Memory

## Implemented

- Company Canon registry
- Existing company-level portal memory
- `nexus_memory_records`
- Decision Register
- Evidence Registry
- Contractor reusable-pattern reference atlas
- provenance, sensitivity, approval state, source timestamp, supersession, and client visibility fields

Memory classes:

- canonical
- client-specific
- reusable pattern
- operational event
- temporary

## Rules

- Source records remain authoritative.
- Retrieval is a context-packet mechanism, not an excuse to dump all company/client content into every prompt.
- Cross-client confidential context must never be mixed.
- Conflicting sources are surfaced and routed to an owner.
- A decision update should preserve why prior guidance was superseded.

## Gate still open

Relystra still needs a formal ten-question retrieval test against current sources and recurring meeting/engagement-close memory capture evidence.

---

# Layer 07 — Software Around AI: Relystra Operations Hub

## Already operational / implemented

The current Relystra Hub already contains substantial MVP jobs:

- Today / action center
- Client and admin views
- Requests
- Approvals
- Tasks / action items
- Projects / milestones
- Automations
- Improvements / metrics
- Secure documents
- Company Memory
- Alerts / activity

The new control plane adds the persistent schema required for:

- system definitions
- workflow/run health
- evidence
- improvements
- decisions
- incidents
- client-visible selections of new control-plane records

## Product boundary

The Hub remains an internal/client **service interface**, not a standalone SaaS promise. A generic client AI chat box is intentionally not the center of the product. A contextual assistant should be added only when it can be grounded in real company records, workflows, permissions, approvals, and evidence.

## Gate still open

Weekly active client use, request-to-resolution time, approval latency, measured value, and founder support burden require live-client observation.

---

# Layer 08 — Tools

## Implemented

The Tool Registry currently contains the existing stack and one rollback path. No new tool was purchased.

Each Tool Decision Card can record:

- classification: core / client-dependent / experimental / retire
- purpose
- owner
- data categories
- known monthly cost (nullable rather than invented)
- security-review state
- renewal date
- measurable value
- exit path
- next review

The founder console refuses to treat a core tool as properly reviewed without a measurable-value statement and exit path.

## Gate still open

Quarterly ROI/use data must be accumulated. The `$0 additional software until value is proven` rule remains active.

---

# Layer 09 — AI-Native Company Management

## Implemented

### Founder-only `/operations` console

Sections:

- Daily Command Brief
- Ten-Layer Build
- Founder Decision Queue
- Agents & Evaluations
- Workflows & Health
- Canon, Memory & Evidence
- Improvement Engine
- Tool Governance
- Operating Reviews

The console authenticates through Supabase and additionally requires `nexus_is_platform_admin()`.

### Daily Command Brief

The brief is deterministic from current records. It prioritizes:

1. founder decision queue
2. critical/high incidents
3. workflow exceptions
4. client approvals
5. urgent/high client requests

It also explicitly surfaces evidence gaps, including:

- no workflow-run evidence
- no agent evaluation results
- no client baseline/current metrics
- no validated Improvement Ledger result
- empty Evidence Registry

This means the OS is designed to tell the founder what Relystra **cannot yet claim**, not merely show positive-looking dashboards.

### Eight operating domains

- Pipeline
- Delivery
- Managed Operations
- Product / IP
- Knowledge
- Proof
- Finance / Capacity
- Growth

### Actionable KPIs

Eight KPI definitions are seeded. Each includes a response rule rather than being a decorative metric.

### Operating reviews

Daily, weekly, monthly, quarterly, and architecture snapshots can be saved to `nexus_operating_reviews`.

## Gate still open

Founder-hours redistribution, queue aging, KPI response discipline, and consistent cadence need to be measured over time.

---

# Layer 10 — Continuous Improvement

## Implemented

- Evidence Registry
- Experiment registry
- Improvement Ledger
- Incident/CAPA registry
- Workflow run and exception records
- Agent evaluation history
- Operating reviews

A validated Improvement Ledger entry requires an observed result and attribution note in the founder console. It should not be used to convert a modeled benefit into a verified outcome.

## Improvement loop

`Baseline → change/hypothesis → controlled test → run/evidence → observed result → attribution/limitations → exception/root cause → correction → regression/retest → update SOP/system/agent/template/canon → proof only with permission`

## Gate still open

No validated client before/after outcome exists yet. Productization, estimation calibration, and repeat-failure reduction therefore cannot be claimed as complete.

---

# 4. Current implementation gates — what is intentionally NOT live

The following are deliberately not represented as operational merely because the schema exists:

1. **No autonomous Managed Operations agent.** Managed Operations and Client Success roles remain gated.
2. **No broad external agent write permission.** External-action promotion is blocked in the founder console.
3. **No client-facing ROI claim from modeled assumptions.** There is no validated before/after case yet.
4. **No top-five automation candidates chosen from invented baselines.** Twenty-five candidates exist; baseline measurements are required next.
5. **No first contractor pilot declared without a real business owner/baseline/KPI.** The decision is in the Founder Decision Queue.
6. **No additional automation/orchestration software purchase.** The current stack is used until a demonstrated workflow needs more.
7. **No standalone SaaS claim for Relystra Hub.** Productization follows repeated client use and support economics.
8. **No generic contextual AI assistant promoted as the product.** It comes after grounded workflows and permission-aware memory are demonstrated.
9. **No automatic pricing/scope commitment.** Founder authority remains explicit.
10. **No assumption that connector/API success equals business completion.** Workflow runs track business completion separately.

# 5. QA / security controls

## Database

- All AI-native control-plane tables use Row Level Security.
- Anonymous visitors have no direct table privileges on the control-plane records.
- Admin-only registries rely on platform-admin authorization.
- Company-scoped records can be exposed to company members only when explicitly marked `client_visible`.
- Anonymous execution was removed from `nexus_is_company_creator`.
- `rls_auto_enable()` execution was removed from `PUBLIC`, `anon`, and `authenticated` because it does not need to be a public API.
- Trigger-only `nexus_touch_updated_at()` has no direct API execution grant.

## Repository / deployment

- `/operations` is `noindex,nofollow`.
- `/operations` receives `Cache-Control: no-store, max-age=0` through Cloudflare Pages headers.
- GitHub Actions QA checks JavaScript syntax for the core app, portal modules, founder console, and Snapshot endpoint.
- CI also verifies founder authorization call, external-action blocking language, evidence-gate guardrail, workflow `business_completed` usage, noindex/no-store setup, and absence of obvious service-role/secret references in founder-console assets.

## Known security-advisor items requiring separate treatment

Not every Supabase linter warning should be cleared blindly:

- The public Opportunity Snapshot submission RPC is intentionally callable without login because it is the controlled lead-submission boundary. It performs bounded validation and writes into an RLS-protected lead table.
- Several authenticated `SECURITY DEFINER` helper functions implement existing Relystra authorization/storage permission logic. Refactoring them should be a separate authorization test project so the portal is not broken merely to silence a generic lint.
- Supabase Auth leaked-password protection is currently reported disabled and should be evaluated/enabled as part of the authentication-hardening backlog.
- A Statecraft `statecraft_download_tokens` RLS/no-policy notice is outside the Relystra control-plane migration.

# 6. Next evidence-producing work

The immediate next sequence is not “build more features.” It is:

1. Execute and score the 28 queued agent evaluation cases.
2. Measure baseline minutes/run, runs/month, and rework/error rate for the 25 automation candidates.
3. Select the top five only after those baseline fields are populated.
4. Write/run the manual SOPs for those five and classify real exceptions.
5. Run Relystra self-diagnosis through the Fact/Hypothesis/Unknown + opportunity scorecard standard.
6. Use a real contractor/construction-adjacent prospect/client to validate one workflow reference model.
7. Define baseline, KPI, owner, access boundary, pilot limit, acceptance criteria, and rollback for the first commercial pilot.
8. Run it initially in manual/AI-assisted managed mode.
9. Record every run, intervention, exception, and business completion.
10. Conduct a 30-day value review before any case-study/ROI claim or permission expansion.
11. Promote reusable patterns only after they survive repeated evidence.
12. Review tool spend, permissions, and the Hub roadmap at fixed architecture gates.

# 7. Definition of success

The ten-layer implementation is working when all of the following rise together:

- measurable client value
- founder leverage
- decision traceability
- workflow reliability
- client trust/control
- reusable IP
- evidence quality
- managed recurring revenue economics

while these do **not** rise faster:

- founder support burden
- hidden exceptions
- uncontrolled permissions
- software spend
- duplicated state
- unmeasured complexity
- unsupported client claims

The architecture is therefore considered **implemented at the foundation/control level, not proven at the operating-value level**. The system is deliberately designed to preserve that distinction.
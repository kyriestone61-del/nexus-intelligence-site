# Nexus Intelligence Multi-Agent Revenue Flywheel — Operating Plan

## Objective
Create a governed revenue engine that moves prospects through:

**Discovery / intake → verified research → AI Opportunity Score → exception classification → qualifying trigger → personalized outreach packet → independent QA → founder approval → outreach tracking → reply / booking → diagnosis → onboarding → managed retainer → ROI evidence → learning**

The system automates analysis, scoring, drafting, queueing, monitoring and learning. It does **not** automatically contact prospects, commit pricing/contracts, or modify consequential client systems while the revenue agents remain gated.

## Command interpretation
The supplied score starts at 100 and deducts points for operational weaknesses, so a **lower score represents a larger AI/automation gap and higher outreach priority**. The supplied `<=50` threshold is preserved exactly.

No specificity may be fabricated. Examples such as a form submitted at a particular time or a Nexus client performance result may only be used when supported by stored verified evidence.

## Agent organization

### Executive / orchestration layer
- **Executive Orchestrator / CAIOO role:** routes decisions and coordinates the system.
- **AI Operations Observer:** monitors system health, agent quality, exception load and performance.
- **Revenue Operations & Cohesion Agent:** audits handoffs, stale queues, next-action ownership and dead-end states.

### Revenue acquisition layer
- **Lead Generation & Scoring Agent:** normalizes business evidence and applies deterministic score rules.
- **Lead Intake & Exception Classifier:** exposes missing/stale/unsafe inputs rather than guessing.
- **Hyper-Personalized Outreach Agent:** drafts the teardown, Email 1, Email 2 and custom Snapshot preview.
- **Independent Outreach QA / Governance:** validates evidence and compliance before the packet can be approved.

### Client conversion / delivery layer
- **Client Diagnosis Agent:** runs the existing governed diagnosis pipeline.
- **Solution Architect:** converts approved diagnosis into system design.
- **Retainer Fulfillment Agent:** creates the coordinated managed-service work plan.
- **Managed Operations Agent:** tracks SLA, blockers, business completion and interventions.
- **Client Success Agent:** generates client-facing progress summaries.
- **ROI Measurement Agent:** measures baseline vs after-state with attribution confidence.

### Independent verification layer
- **Requirements Coverage Auditor:** maps every Issue #58 command to implementation/runtime/test evidence.
- **Execution Compliance Auditor:** checks every release phase against this approved plan.
- **QA/Governance Agent:** adversarial/regression validation.

## Lead qualification
Target profile fields support:
- Local Services
- Legal
- Real Estate
- E-commerce
- Logistics
- Healthcare Clinics
- Annual revenue: $1M–$15M when known/estimated from supported evidence
- Team: 10–100 when known/estimated from supported evidence

These are targeting criteria, not facts Nexus is allowed to invent.

## Deterministic AI Opportunity Score v1
Start at **100**.
- Verified lead response time >120 minutes: **-30**
- Verified absence of automated booking: **-20**
- Verified reviews describing slow follow-up/admin bottlenecks: **-20**

Unknown signals receive **no deduction** and reduce score confidence.

A non-suppressed score `<=50` automatically creates exactly one active outreach-packet generation job.

## Outreach packet
Required per qualifying lead:
1. 30–60 second audit teardown
2. Email 1 — direct, specific, non-pushy
3. Email 2 — custom Snapshot preview follow-up
4. 2-minute workflow-map / Snapshot concept
5. Claim-to-evidence map
6. Confidence + compliance flags
7. Human approval state

The AI runtime uses four stages:
1. Evidence Strategist
2. Hyper-Personalized Outreach Drafter
3. Independent Outreach QA / Governance Verifier
4. Final Outreach Composer
5. **Final Packet Independent Verifier** on the repaired packet before QA status is stored

Email 2 remains `waiting` until Email 1 is actually marked sent. Only then is Email 2 created as due **3 days later**, still requiring explicit human approval.

## Trust and compliance
Hard rules:
- No invented form test, response time, review, employee count, revenue, revenue loss, decision maker, contact, quote or client result.
- Nexus outcome proof requires a case-study record that is publishable, evidence-complete and client-authorized.
- Do-not-contact suppresses jobs and unsent sequence steps.
- Approval and send marking re-check current contactability and unresolved high/critical exceptions.
- No automatic SMS without explicit opt-in.
- External research/media/orchestration platforms are optional adapters, not runtime dependencies.

## Retainer delivery
The supplied $2,500–$5,000/month band is modeled as a configurable service band, not a promise or automatically created contract.

An approved/signed engagement routes through:
Solution Architect → Retainer Fulfillment → Managed Operations → Client Success → ROI Measurement → AI Ops learning/evidence review.

## Release sequence
1. Formal requirement contract — Issue #58
2. Schema/RLS
3. Deterministic scoring + exception routing
4. Agent/workflow/KPI/evaluation registration
5. Approval/send controls
6. Scheduled worker revenue-job runtime
7. Static contract QA
8. Existing Nexus regression/security suites
9. Rollback-mode/live-schema validation where possible
10. Production migrations in order
11. Worker deployment into existing five-minute scheduled function
12. Synthetic scoring/queue tests without external outreach
13. Production idle/health verification
14. Coverage Auditor evidence map
15. Execution Compliance sign-off

## Promotion rule
The initial release does **not** promote outbound autonomy. More authority is considered only after evaluation evidence demonstrates reliability and the Founder explicitly approves the change.

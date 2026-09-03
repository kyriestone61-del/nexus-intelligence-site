# Nexus Intelligence — Market Readiness Certification

**Directive:** NEXUS-MR-1.0  
**Assessment date:** 2026-09-03  
**Production repository:** `kyriestone61-del/nexus-intelligence-site`  
**Production branch / SHA:** `main` @ `4d16ebde15e089773afbc86fbf116ae266bfed85`  
**Readiness branch:** `readiness/nexus-market-readiness-2026-09-03`  
**Readiness PR:** #95  

## 1. Executive status

# NO-GO

Nexus is materially closer to market readiness than the prior working assumptions suggested. The current production build is live, the Step 2 discovery/diagnosis redesign is merged, the diagnosis engine is producing structured results, the public Snapshot funnel is instrumented, the client-control-room architecture has green regression gates, and the current `main` CI set is green.

Nexus is **not yet approved for active marketing** because production transactional email is failing at the provider layer: Resend rejects mail from `nexusintelligence.live` because the domain is not verified. Forty-two real failed outbox rows remain affected. This violates the required communications and reliability release gates.

Two additional pre-marketing closure items remain:

1. the diagnosis-generated action path does not yet prove explicit dependency sequencing from the standard action-package dependency graph; and
2. live Google Calendar booking configuration was not covered by the existing production smoke, so PR #95 adds a dedicated live booking runtime gate.

No production client diagnosis was auto-approved during this readiness run. Moon Wax remains at the human-review boundary.

---

## 2. Verified current architecture

Nexus currently operates as:

- **Public + portal application:** Cloudflare Pages / Pages Functions
- **Primary application repository:** GitHub `kyriestone61-del/nexus-intelligence-site`
- **Database / Auth / Storage / RPC:** Supabase
- **Diagnosis execution:** Supabase Edge Function `nexus-diagnosis-execute`
- **Transactional email:** Supabase outbox + `nexus-email-worker` Edge Function + Resend
- **Email scheduling:** Supabase `pg_cron`, every five minutes
- **SMS:** optional provider path; currently unconfigured, with in-app delivery remaining active
- **Booking:** Cloudflare Pages Function backed by Google Calendar FreeBusy
- **Analytics / lead attribution:** Nexus analytics tables + governed revenue-lead objects
- **Release QA:** GitHub Actions static, architecture, diagnosis, portal-access, pre-marketing, and production-runtime smoke gates

The repository is the intended source of truth for application and migration code. Production Supabase migration state was reconciled during this run for all changes made here.

---

## 3. Core operating workflow

The intended and partially verified live workflow is:

**Traffic**  
→ public Nexus pages  
→ **AI Opportunity Snapshot / Fit Call**  
→ governed lead / attribution record  
→ **Client workspace activation**  
→ discovery context + evidence packet  
→ **Diagnosis execution**  
→ structured findings / evidence / recommended actions  
→ human review / revision / approval  
→ **diagnosis orchestration**  
→ opportunities + tasks + document requests + approvals + metrics + milestones  
→ client / Nexus execution  
→ evidence / review / completion  
→ improvement measurement.

A prior controlled QA diagnosis has successfully executed the approval/orchestration transition and created downstream objects atomically. The current Moon Wax diagnosis has executed successfully to `ready_for_review` and remains intentionally unapproved pending human review.

---

## 4. Changes implemented during this readiness run

### MR-SEC-01 — Narrow anonymous SECURITY DEFINER exposure

**Problem:** four Nexus `SECURITY DEFINER` functions were directly executable by `anon`. Internal authorization checks prevented a confirmed privilege escalation, but anonymous exposure was unnecessary.

**Implemented:**

- revoked anonymous EXECUTE from `nexus_admin_apply_manual_diagnosis`
- revoked PUBLIC/anonymous EXECUTE from `nexus_get_client_action_context`, retaining authenticated + service-role access
- revoked anonymous EXECUTE from `nexus_get_inbox_admin_preview`
- revoked anonymous direct EXECUTE from trigger function `nexus_sync_roi_from_approval_chain`

**Production migration:** `20260903074430_nexus_revoke_anon_security_definer_execute`  
**Repository migration:** `supabase/migrations/20260903_nexus_revoke_anon_security_definer_execute.sql`

**Verification:** Supabase Security Advisor no longer reports Nexus anonymous `SECURITY DEFINER` warnings for those functions.

### MR-OPS-01 — Add failed-email recovery controls

**Problem:** Resend 4xx responses are deliberately treated as permanent by the worker. After provider configuration is corrected, existing failed records would otherwise remain stranded.

**Implemented:**

- `nexus_admin_retry_failed_email(uuid)` — requeue one failed Nexus email
- `nexus_admin_requeue_unverified_domain_failures()` — narrowly requeue only the exact failed Resend 403 domain-verification cohort
- both are `SECURITY DEFINER`, require `nexus_is_platform_admin()`, deny `anon`, and are executable only by authenticated/service-role callers

**Production migration:** `20260903075725_nexus_admin_email_retry_controls`  
**Repository migration:** `supabase/migrations/20260903_nexus_admin_email_retry_controls.sql`

### MR-DIAG-01 — Remove transcript-only wording from standard diagnosis template

**Problem:** Step 2 is evidence-packet/file-agnostic, but the standard template still displayed `Review discovery transcript`. This discouraged correct template mapping when the evidence was not a transcript.

**Implemented:** retained the stable code `diagnosis_review_transcript` but changed the human/model-facing title to `Review discovery evidence` and broadened its description to the authorized discovery evidence packet and captured context.

**Production migration:** `20260903075843_nexus_file_agnostic_discovery_template`  
**Repository migration:** `supabase/migrations/20260903_nexus_file_agnostic_discovery_template.sql`

### MR-QA-01 — Add live booking runtime gate

**Problem:** existing pre-marketing QA verified the booking code contract but did not prove that the deployed Google Calendar configuration actually returns live availability.

**Implemented:** `.github/workflows/booking-runtime-smoke.yml` asserts the live production endpoint returns HTTP 200, `ok:true`, `configured:true`, and a `slots` payload. It runs on relevant PR/push changes, manual dispatch, and a six-hour schedule.

### MR-DATA-01 — Remove synthetic QA funnel contamination

Three `website_opportunity_snapshot` revenue leads were confirmed synthetic (`QA *` companies using `qa-*@example.com`) and were removed with a QA-only filter. No real lead rows were deleted.

Three failed `@example.com` email rows were changed to `cancelled` with `qa_synthetic` classification. No real failed messages were cancelled.

Current email outbox state after cleanup:

- **42 failed** — real Resend domain-verification failures
- **4 cancelled**
- **0 active synthetic QA failures**

---

## 5. Release-gate status

| Gate | Status | Evidence / reason |
|---|---|---|
| A — Public conversion | **PARTIAL** | Homepage, CTA, Snapshot and analytics are live; booking code exists, but live calendar config is awaiting the new runtime smoke result. |
| B — Authentication / tenancy | **PASS WITH P1 HARDENING** | RLS and client-update boundaries are present; portal access/runtime gates are green; anonymous definer exposure found here was removed. Supabase leaked-password protection remains disabled. |
| C — Discovery | **PASS** | Step 2 evidence-first redesign is merged; context/evidence tables are live; current real-client diagnosis has executed from the redesigned lane. |
| D — Diagnosis | **PASS** | Two production diagnosis runs have structured results and no execution error; one approved QA run and one real-client run at human review. |
| E — Orchestration | **PARTIAL / FAIL** | Atomic downstream orchestration is proven, but the diagnosis-generated action path does not yet prove explicit task dependencies from the standard package dependency graph. |
| F — Client execution | **PARTIAL** | Task state machine, review handoff, documents, approvals and dependency-aware client action context exist; no fresh authenticated browser E2E was executed from this control environment. |
| G — Admin operation | **PASS / PARTIAL** | Admin diagnosis/review/orchestration RPCs, inbox projection and Control Room reconciliation contracts are green; email recovery now has governed admin RPCs. |
| H — Communications | **FAIL — LAUNCH BLOCKER** | 42 transactional emails failed because Resend reports `nexusintelligence.live` is not verified. |
| I — Security | **PASS FOR P0** | No credible Nexus cross-tenant P0 found in this run; anonymous definer exposure was tightened. Leaked-password protection remains P1. |
| J — Reliability | **FAIL** | Production email health remains failed. Other production runtime smoke checks are green. |
| K — CI | **PASS on current main** | Current `main` head has green Nexus Pre-Marketing QAQC, Diagnosis Step 4 QA, Nexus QA, Portal Access Safety, Control Room Reconciliation, and Production Runtime Smoke. |
| L — Mobile | **PARTIAL** | Diagnosis Step 4 includes a green mobile contract; no fresh full authenticated mobile browser regression was available from this execution environment. |
| M — Red team | **FAIL** | Communications blocker plus unresolved orchestration-dependency proof prevent certification. |

---

## 6. Consolidated P0 / P1 readiness backlog

### NX-MR-P0-01 — Resend production domain is not verified

**Subsystem:** Transactional communications  
**Severity:** P0 launch blocker  
**Evidence:** 42 current `nexus_email_outbox` rows failed with Resend HTTP 403 stating the `nexusintelligence.live` domain is not verified.  
**User impact:** Snapshot/client/admin email delivery can fail silently from the recipient's perspective.  
**Business impact:** leads and clients cannot be reliably onboarded or progressed through email-dependent workflows.  
**Root cause:** external Resend domain/DNS configuration.  
**Correction:** verify `nexusintelligence.live` in Resend, then invoke the new governed requeue control and confirm successful provider acceptance/delivery.  
**Owner:** Founder / DNS + Resend account owner.  
**Test:** controlled real-address email, outbox status transition, provider message ID, delivery confirmation, and `email_queue` health recovery.  
**Status:** BLOCKED ON EXTERNAL CONFIGURATION.

### NX-MR-P1-01 — Diagnosis-generated dependency semantics are incomplete

**Subsystem:** Diagnosis → workspace orchestration  
**Severity:** P1  
**Evidence:** 42 active templates / 6 packages contain 19 explicit dependency edges, but the approved legacy QA diagnosis produced zero `dependency_task_id` links and the diagnosis output contract currently expresses template code but not a client-specific dependency field.  
**Impact:** generated work may be correct as a set while sequencing/prerequisites remain implicit.  
**Correction:** define a single authoritative contract for diagnosis-generated dependencies, apply only valid same-run/same-company dependencies, and add an integration test that proves blocked → prerequisite complete → downstream unlock.  
**Owner:** Engineering.  
**Status:** OPEN.

### NX-MR-P1-02 — Live booking configuration requires runtime proof

**Subsystem:** Public conversion / booking  
**Severity:** P1 verification blocker  
**Evidence:** source code returns 503 when Google Calendar configuration is absent and 502 when FreeBusy fails; previous CI checked only the code contract.  
**Correction:** PR #95 adds a live booking runtime smoke.  
**Owner:** Engineering / deployment configuration.  
**Status:** PENDING PR RUNTIME RESULT.

### NX-MR-P1-03 — Supabase leaked-password protection disabled

**Subsystem:** Authentication  
**Severity:** P1 hardening  
**Evidence:** Supabase Auth Security Advisor warning.  
**Correction:** enable leaked-password protection in Supabase Auth and retest sign-in/password flows.  
**Owner:** Founder / Supabase configuration.  
**Status:** OPEN.

---

## 7. P2 / P3 post-launch backlog

These items should not displace P0/P1 work:

- SMS provider is unconfigured; in-app notification delivery remains active. Keep P2 unless SMS becomes part of the sold service contract.
- Supabase performance advisor reports several Nexus foreign-key indexes and RLS init-plan optimization opportunities. Address after correctness gates.
- Review duplicate Nexus indexes reported by the performance advisor before removing any index.
- `main` is currently not protected by a required-status-check rule. Add branch/ruleset protection as release governance hardening.
- Expand live mobile authenticated E2E coverage beyond the existing diagnosis mobile contract.
- Add direct operator UI for governed email retry if recurring provider-recovery operations become common; the database recovery primitive now exists.

---

## 8. Test and evidence summary

### Current `main` @ `4d16ebd`

Green:

- Nexus Pre-Marketing QAQC
- Nexus Diagnosis Step 4 QA
- Nexus QA
- Nexus Portal Access Safety Gate
- Nexus Control Room Reconciliation QA
- Nexus Production Runtime Smoke

The production runtime smoke verifies deployed portal build markers on both the custom domain and Pages domain, the restored public client-login path, absence of the prior Inbox mutation-observer loop, and unauthorized rejection for protected diagnosis-report/email-worker surfaces.

### Production data/runtime checks performed in this readiness run

- Supabase project health verified active
- current migration history inspected
- Nexus Security Advisor audited before and after ACL hardening
- key RLS / table-policy / task-update-boundary contracts inspected
- diagnosis run statuses and execution-error state inspected
- approved diagnosis orchestration summary inspected
- action-template and package integrity checked
- dependency edges checked for missing/cross-company/cross-project corruption
- transactional outbox status and failure signatures inspected
- email scheduler confirmed active every five minutes
- synthetic QA lead/email contamination identified and cleaned
- analytics event/funnel activity inspected
- public production marketing pages and Snapshot re-crawled on 2026-09-03

### Not fully executable from this control environment

- fresh authenticated browser E2E as a real client/admin
- fresh full-device mobile browser regression
- direct Resend account/DNS verification
- direct Cloudflare environment-secret inspection

These limitations are reflected as partial/unverified gates rather than silently assumed passes.

---

## 9. Production status

**Current production application:** `main` @ `4d16ebde15e089773afbc86fbf116ae266bfed85`  
**Current readiness changes:** PR #95, intentionally draft until blockers close.  
**Database:** production includes all three readiness migrations listed above.  
**Known-good application rollback reference:** production commit immediately preceding the Step 2 merge should remain available until PR #95 and subsequent release gates are certified; no destructive database rollback was performed here.  

No readiness-branch application changes have been promoted to `main` in this run.

---

## 10. Founder manual actions required

### Required before active marketing

1. **Verify `nexusintelligence.live` in Resend.** Complete the DNS/domain verification Resend requires for the production sender.
2. After verification, run the governed requeue for the unverified-domain cohort and confirm at least one real controlled delivery end-to-end.
3. Enable Supabase Auth leaked-password protection.

No founder action is required for the synthetic QA cleanup, Nexus ACL hardening, email retry primitives, or file-agnostic diagnosis template correction; those are already implemented.

---

## 11. Marketing readiness

### Do not begin yet

- paid acquisition
- broad automated outreach
- large-volume partnership promotion
- any campaign that assumes reliable transactional email delivery

### Can continue while blockers close

- controlled founder-led sales preparation
- content/SEO preparation
- case-study/evidence preparation
- low-volume manual conversations where the founder can personally manage communication
- product QA with non-production/synthetic data

Nexus should move from **NO-GO** to **CONDITIONAL GO** only after:

1. Resend domain verification and successful real delivery;
2. email health returns healthy after controlled requeue;
3. live booking runtime gate passes; and
4. diagnosis-generated dependency behavior is either implemented/tested or formally constrained so generated tasks cannot misrepresent prerequisites.

A **MARKET READY** verdict additionally requires the remaining authenticated client/admin and mobile regression evidence required by NEXUS-MR-1.0.

---

## 12. Immediate execution order

1. Founder verifies Nexus domain in Resend.
2. Engineering runs the governed failed-domain email requeue and verifies real delivery.
3. Read PR #95 booking runtime result and remediate any deployment configuration failure.
4. Implement/test diagnosis-generated dependency semantics with an isolated QA client/run; do not use Moon Wax as destructive test data.
5. Run authenticated client/admin regression and mobile-critical flows.
6. Re-run the full release-gate matrix.
7. Promote PR #95 only after its changes are green and the release verdict is updated.

---

## 13. Verdict

**NEXUS INTELLIGENCE IS CURRENTLY: NO-GO FOR ACTIVE MARKETING.**

The system is not broadly broken. Its diagnosis, data model, portal architecture, CI, public positioning, and core orchestration foundation are substantially operational. The current blocking condition is concrete and bounded: production communications must be made reliable, followed by explicit closure of booking-runtime and orchestration-dependency evidence.

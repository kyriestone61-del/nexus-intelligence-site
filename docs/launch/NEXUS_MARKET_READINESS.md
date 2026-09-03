# Nexus Intelligence — Market Readiness Certification

**Directive:** NEXUS-MR-1.0  
**Assessment date:** 2026-09-03  
**Production repository:** `kyriestone61-del/nexus-intelligence-site`  
**Production branch / SHA:** `main` @ `4d16ebde15e089773afbc86fbf116ae266bfed85`  
**Readiness branch:** `readiness/nexus-market-readiness-2026-09-03`  
**Readiness PR:** #95  

## 1. Executive status

# NO-GO

Nexus is materially closer to market readiness than the prior working assumptions suggested. The Step 2 discovery/diagnosis redesign is merged, the diagnosis engine is producing structured results, the public Snapshot funnel is instrumented, the client/admin architecture is covered by green regression contracts, and current application/security QA is green.

Nexus is **not yet approved for active marketing** because two live production conversion/communication dependencies are broken:

1. **Transactional email:** Resend rejects production mail because `nexusintelligence.live` is not verified. Forty-two real failed outbox rows remain affected.
2. **Fit-call booking:** the new live runtime gate returns **HTTP 503** with `configured:false` and `Live calendar booking is not configured yet.` The production Cloudflare Pages environment is missing required Google Calendar configuration.

A third P1 closure item remains in diagnosis orchestration: the diagnosis-generated action path does not yet prove explicit dependency sequencing from the standard action-package dependency graph.

No production client diagnosis was auto-approved during this readiness run. Moon Wax remains at the human-review boundary.

---

## 2. Verified current architecture

Nexus currently operates as:

- **Public + portal application:** Cloudflare Pages / Pages Functions
- **Primary application repository:** GitHub `kyriestone61-del/nexus-intelligence-site`
- **Database / Auth / Storage / RPC:** Supabase
- **Diagnosis execution:** Supabase Edge Function `nexus-diagnosis-execute`
- **Transactional email:** Supabase outbox + `nexus-email-worker` + Resend
- **Email scheduling:** Supabase `pg_cron`, every five minutes
- **SMS:** optional provider path; currently unconfigured, while in-app delivery remains active
- **Booking:** Cloudflare Pages Function backed by Google Calendar FreeBusy/event creation
- **Analytics / lead attribution:** Nexus analytics tables + governed revenue-lead objects
- **Release QA:** GitHub Actions static, architecture, diagnosis, admin, portal-access, security, pre-marketing and production-runtime gates

The repository is the intended application/migration source of truth. Production Supabase migration state was reconciled for every database change made during this run.

---

## 3. Core operating workflow

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

A controlled QA diagnosis has successfully executed approval/orchestration and created downstream objects atomically. The current Moon Wax diagnosis has executed successfully to `ready_for_review` and remains intentionally unapproved pending human review.

---

## 4. Changes implemented during this readiness run

### MR-SEC-01 — Narrow anonymous SECURITY DEFINER exposure

Four Nexus `SECURITY DEFINER` functions were directly executable by `anon`. Their internal authorization checks prevented a confirmed privilege escalation, but the exposure was unnecessary.

Implemented:

- revoked anonymous EXECUTE from `nexus_admin_apply_manual_diagnosis`
- revoked PUBLIC/anonymous EXECUTE from `nexus_get_client_action_context`, retaining authenticated + service-role access
- revoked anonymous EXECUTE from `nexus_get_inbox_admin_preview`
- revoked anonymous direct EXECUTE from trigger function `nexus_sync_roi_from_approval_chain`

**Production migration:** `20260903074430_nexus_revoke_anon_security_definer_execute`  
**Repository:** `supabase/migrations/20260903_nexus_revoke_anon_security_definer_execute.sql`

Verification: Supabase Security Advisor no longer reports the Nexus anonymous-definer warnings found at baseline.

### MR-OPS-01 — Add governed failed-email recovery

Resend 4xx responses are treated as permanent by the worker, so correcting the provider would not automatically recover existing failed rows.

Implemented:

- `nexus_admin_retry_failed_email(uuid)` — requeue one failed Nexus email
- `nexus_admin_requeue_unverified_domain_failures()` — requeue only the exact failed Resend-403 domain-verification cohort
- both require `nexus_is_platform_admin()`, deny `anon`, and are granted only to authenticated/service-role callers

**Production migration:** `20260903075725_nexus_admin_email_retry_controls`  
**Repository:** `supabase/migrations/20260903_nexus_admin_email_retry_controls.sql`

### MR-DIAG-01 — Remove transcript-only standard-action wording

Step 2 is evidence/file-agnostic, but one standard template still displayed `Review discovery transcript`. The stable internal code remains `diagnosis_review_transcript`; its title is now `Review discovery evidence`, and the description now covers the authorized evidence packet + captured context.

**Production migration:** `20260903075843_nexus_file_agnostic_discovery_template`  
**Repository:** `supabase/migrations/20260903_nexus_file_agnostic_discovery_template.sql`

### MR-QA-01 — Add live booking runtime gate

Added `.github/workflows/booking-runtime-smoke.yml`. It requires the production endpoint to return HTTP 200 with `ok:true`, `configured:true`, and a `slots` payload. Failure evidence is preserved as a workflow artifact.

**First live finding:** HTTP **503**, `configured:false`, `Live calendar booking is not configured yet.`

### MR-DATA-01 — Remove synthetic QA funnel contamination

- Removed three synthetic `website_opportunity_snapshot` revenue leads restricted to `QA *` companies and `qa-*@example.com` recipients.
- Reclassified three failed `@example.com` email records as `cancelled` / `qa_synthetic`.
- No real lead or client record was deleted.

Current outbox after cleanup:

- **42 failed** — real Resend domain-verification failures
- **4 cancelled**
- **0 active synthetic QA failures**

---

## 5. Release-gate status

| Gate | Status | Evidence / reason |
|---|---|---|
| A — Public conversion | **FAIL** | Public pages/Snapshot are live, but production fit-call availability returns HTTP 503 because calendar booking is not configured. |
| B — Authentication / tenancy | **PASS WITH P1 HARDENING** | RLS and client-update boundaries are present; security/admin gates are green; anonymous definer exposure found here was removed. Leaked-password protection remains disabled. |
| C — Discovery | **PASS** | Step 2 evidence-first redesign is merged; live context/evidence structures exist; current real-client diagnosis executed from the redesigned lane. |
| D — Diagnosis | **PASS** | Two production diagnosis runs have structured results and no execution error; one controlled QA approval and one real-client run at human review. |
| E — Orchestration | **PARTIAL / FAIL** | Atomic downstream orchestration is proven, but diagnosis-generated actions do not yet prove explicit prerequisite links from the standard package dependency graph. |
| F — Client execution | **PARTIAL** | Task state machine, review handoff, documents, approvals and dependency-aware action context exist; no fresh fully authenticated browser E2E was available from this control environment. |
| G — Admin operation | **PASS / PARTIAL** | Admin Journey QA and Control Room Reconciliation are green; governed email recovery now exists. |
| H — Communications | **FAIL — LAUNCH BLOCKER** | 42 production transactional emails failed because Resend reports the Nexus domain is not verified. |
| I — Security | **PASS FOR P0** | Parallel Security QA is green and no credible Nexus cross-tenant P0 was found; leaked-password protection remains P1. |
| J — Reliability | **FAIL** | Email health is failed and live booking config is absent. |
| K — CI | **PASS EXCEPT INTENTIONAL BOOKING GATE FAILURE** | Application, Diagnosis Step 4, Admin Journey, Parallel Security and Control Room gates are green on PR #95; booking runtime correctly fails against current production. |
| L — Mobile | **PARTIAL** | Diagnosis/mobile and responsive admin contracts are green; no fresh full authenticated device regression was available from this execution environment. |
| M — Red team | **FAIL** | Live email + booking failures and unresolved orchestration-dependency proof prevent certification. |

---

## 6. Consolidated P0 / P1 readiness backlog

### NX-MR-P0-01 — Resend production domain is not verified

**Subsystem:** transactional communications  
**Severity:** P0 launch blocker  
**Evidence:** 42 current outbox rows failed with Resend HTTP 403 stating `nexusintelligence.live` is not verified.  
**User impact:** Snapshot/client/admin email can fail.  
**Business impact:** leads and clients cannot be reliably progressed through email-dependent workflows.  
**Root cause:** external Resend domain/DNS configuration.  
**Correction:** verify the production sender domain in Resend, invoke the governed requeue control, and verify provider acceptance + real delivery.  
**Owner:** Founder / DNS + Resend account owner.  
**Status:** BLOCKED ON EXTERNAL CONFIGURATION.

### NX-MR-P0-02 — Production Google Calendar booking is not configured

**Subsystem:** public conversion / fit-call booking  
**Severity:** P0 launch blocker because booking is a primary public CTA  
**Evidence:** PR #95 live booking smoke returns HTTP 503 and `configured:false`.  
**Root cause:** Cloudflare runtime lacks the minimum Google Calendar configuration required by `bookingConfigured()`.

Required production values:

- `GOOGLE_CALENDAR_CLIENT_EMAIL`
- `GOOGLE_CALENDAR_PRIVATE_KEY`
- at least one of:
  - `NEXUS_CALENDAR_ID`, or
  - `GOOGLE_CALENDAR_ID`, or
  - `GOOGLE_CALENDAR_IMPERSONATE`

Operational defaults exist for timezone/duration/lead-time/wall-times, but they should be explicitly reviewed before launch:

- `NEXUS_BOOKING_TIMEZONE` (default `America/New_York`)
- `NEXUS_BOOKING_DURATION_MINUTES` (default `20`)
- `NEXUS_BOOKING_MIN_LEAD_HOURS` (default `12`)
- `NEXUS_BOOKING_WALL_TIMES` (default `10:00,11:30,14:00,15:30`)

The selected service account must also have the required Calendar access to FreeBusy/create/update/delete events for the target calendar.

**Correction:** configure the variables in the Cloudflare production environment, redeploy if required, then require the live booking smoke to pass and perform one controlled fit-call booking/cancel test.  
**Owner:** Founder / Cloudflare + Google Calendar configuration.  
**Status:** BLOCKED ON EXTERNAL CONFIGURATION.

### NX-MR-P1-01 — Diagnosis-generated dependency semantics are incomplete

**Subsystem:** diagnosis → workspace orchestration  
**Severity:** P1  
**Evidence:** 42 active templates / 6 packages contain 19 dependency edges, but the legacy approved QA diagnosis produced zero `dependency_task_id` links and the diagnosis output contract currently exposes template code rather than an explicit client-specific dependency relationship.  
**Impact:** generated work can be correct as a set while sequencing/prerequisites remain implicit.  
**Correction:** define one authoritative diagnosis-generated dependency contract, apply only valid same-run/same-company relationships, and add an integration test proving blocked → prerequisite complete → downstream unlock.  
**Owner:** Engineering.  
**Status:** OPEN.

### NX-MR-P1-02 — Supabase leaked-password protection disabled

**Subsystem:** authentication  
**Severity:** P1 hardening  
**Evidence:** Supabase Auth Security Advisor warning.  
**Correction:** enable leaked-password protection and retest password flows.  
**Owner:** Founder / Supabase configuration.  
**Status:** OPEN.

---

## 7. P2 / P3 post-launch backlog

Do not displace P0/P1 work with these:

- SMS provider unconfigured; in-app notification delivery remains active. Keep P2 unless SMS becomes a contractual requirement.
- Supabase performance advisor reports Nexus foreign-key-index and RLS init-plan optimization opportunities.
- Review duplicate Nexus indexes before removing any.
- `main` is currently not protected by a required-status-check rule; add branch/ruleset protection as release governance hardening.
- Expand live authenticated mobile E2E coverage beyond existing responsive/mobile contracts.
- Add direct operator UI for email retry if provider-recovery work becomes recurrent; the governed DB primitive now exists.

---

## 8. Test and evidence summary

### Current production / `main`

Green at `4d16ebd`:

- Nexus Pre-Marketing QAQC
- Nexus Diagnosis Step 4 QA
- Nexus QA
- Nexus Portal Access Safety Gate
- Nexus Control Room Reconciliation QA
- Nexus Production Runtime Smoke

### PR #95 current gates

Green:

- Nexus Admin Journey QA
- Nexus Control Room Reconciliation QA
- Nexus Diagnosis Step 4 QA
- Nexus Parallel Security QA
- Nexus QA

Failing by design against the current production defect:

- **Nexus Booking Runtime Smoke** — HTTP 503 / `configured:false`

The production runtime and admin/security gates cover deployed portal markers, the restored client-login path, prior Inbox lockout regression protection, protected-route rejection, six-stage admin workflow assertions, Step 2/diagnosis gates, responsive admin contracts, Company Memory privacy boundaries and atomic onboarding architecture.

### Production data/runtime checks performed here

- Supabase project health and migration history inspected
- Security Advisor audited before/after ACL hardening
- RLS / table-policy / task-update-boundary contracts inspected
- diagnosis runs + execution-error state inspected
- approved diagnosis orchestration summary inspected
- action-template/package integrity and dependency graph inspected
- transactional outbox/failure signatures inspected
- five-minute email scheduler confirmed active
- synthetic QA lead/email contamination cleaned with explicit QA-only filters
- analytics/funnel activity inspected
- public marketing pages and Snapshot re-crawled on 2026-09-03
- live booking endpoint probed from GitHub Actions and failure artifact preserved

### Not fully executable from this control environment

- fresh authenticated browser E2E as a real client/admin
- fresh full-device mobile browser regression
- direct Resend account/DNS mutation
- direct Cloudflare environment-secret mutation

No Cloudflare connector is available in this execution environment, and no installable Cloudflare plugin was found. Those configuration blockers are therefore explicitly founder-owned rather than silently assumed complete.

---

## 9. Production status

**Production application:** `main` @ `4d16ebde15e089773afbc86fbf116ae266bfed85`  
**Readiness changes:** PR #95, intentionally draft.  
**Database:** production includes the three readiness migrations described above.  
**Promotion:** no readiness-branch application/workflow changes have been merged to `main`.  

The application rollback target immediately preceding the Step 2 merge should remain available until the next release is certified. No destructive DB rollback was performed.

---

## 10. Founder manual actions required before active marketing

1. **Resend:** verify `nexusintelligence.live` for the production sender.
2. **Cloudflare / Google Calendar:** configure `GOOGLE_CALENDAR_CLIENT_EMAIL`, `GOOGLE_CALENDAR_PRIVATE_KEY`, and a valid calendar target (`NEXUS_CALENDAR_ID`, `GOOGLE_CALENDAR_ID`, or impersonated account); review booking timezone/wall-times.
3. **Supabase Auth:** enable leaked-password protection.

After Resend verification, Engineering can invoke the new governed domain-failure requeue and confirm actual delivery. After Cloudflare configuration, PR #95's live booking smoke provides an objective pass/fail signal.

No founder action is required for the QA data cleanup, Nexus ACL hardening, email-retry primitives, or file-agnostic diagnosis-template correction; those changes are already implemented in production and mirrored to PR #95.

---

## 11. Marketing readiness

### Do not begin yet

- paid acquisition
- broad automated outreach
- large-volume partnerships/promotion
- campaigns that depend on automated email or fit-call booking

### Can continue while blockers close

- founder-led sales preparation
- content/SEO preparation
- case-study/evidence preparation
- low-volume manual conversations personally managed by the founder
- product QA with controlled/synthetic data

Move from **NO-GO** to **CONDITIONAL GO** only after:

1. Resend verification + successful real delivery;
2. email queue health recovers after controlled requeue;
3. Cloudflare booking configuration is present and the live booking smoke passes; and
4. diagnosis-generated dependency behavior is implemented/tested or explicitly constrained so prerequisites cannot be misrepresented.

A **MARKET READY** verdict additionally requires the authenticated client/admin and mobile regression evidence defined by NEXUS-MR-1.0.

---

## 12. Immediate execution order

1. Founder completes Resend domain verification.
2. Founder configures Google Calendar booking credentials/target in Cloudflare production.
3. Engineering requeues the exact Resend-domain failure cohort and verifies real delivery.
4. Re-run the booking runtime gate and perform one controlled booking/cancel flow.
5. Implement/test diagnosis-generated dependency semantics using isolated QA data; do not use Moon Wax as destructive test data.
6. Run authenticated client/admin regression and mobile-critical flows.
7. Re-run the full release matrix and update this verdict.
8. Promote PR #95 only after the release gates are green.

---

## 13. Verdict

**NEXUS INTELLIGENCE IS CURRENTLY: NO-GO FOR ACTIVE MARKETING.**

The system is not broadly broken. Diagnosis, the data model, portal/admin architecture, CI, public positioning and core orchestration foundation are substantially operational. The live blockers are now bounded and proven: production email sender verification, production Calendar booking configuration, and explicit orchestration-dependency closure.

# Nexus Intelligence — Market Readiness Certification

**Directive:** NEXUS-MR-1.0  
**Assessment date:** 2026-09-03  
**Production repository:** `kyriestone61-del/nexus-intelligence-site`  
**Production application:** `main` @ `4d16ebde15e089773afbc86fbf116ae266bfed85`  
**Readiness branch:** `readiness/nexus-market-readiness-2026-09-03`  
**Readiness PR:** #95 (draft; do not merge while P0 gates are open)

## 1. Executive status

# NO-GO FOR ACTIVE MARKETING

Nexus is substantially operational. The public experience, Step 2 discovery/evidence pipeline, diagnosis engine, core client/admin architecture, governed task lifecycle, action-template catalog, CI, security boundaries, and diagnosis-to-workspace orchestration are functioning at a materially stronger level than the baseline assumptions suggested.

Two live production P0 blockers remain and are both external configuration dependencies:

1. **Transactional email:** Resend rejects production mail because `nexusintelligence.live` is not verified. Forty-two real failed outbox rows remain affected.
2. **Fit-call booking:** `https://nexusintelligence.live/api/booking-availability` returns HTTP **503** with `configured:false` and `Live calendar booking is not configured yet.` The Cloudflare production runtime lacks the required Google Calendar configuration.

The prior diagnosis/action dependency P1 is now **resolved in production and verified with isolated QA data**. No real client diagnosis was auto-approved during that test. Moon Wax remains at `ready_for_review` behind the intended human approval boundary.

---

## 2. Verified architecture

Nexus currently operates as:

- **Public + portal application:** Cloudflare Pages / Pages Functions
- **Repository / release control:** GitHub
- **Database / Auth / Storage / RPC:** Supabase
- **Diagnosis execution:** Supabase Edge Function `nexus-diagnosis-execute`
- **Transactional email:** `nexus_email_outbox` + `nexus-email-worker` + Resend
- **Email scheduler:** Supabase `pg_cron`, every five minutes
- **Booking:** Cloudflare Pages Function + Google Calendar FreeBusy/event APIs
- **Analytics / lead attribution:** Nexus analytics tables + governed revenue-lead records
- **Release QA:** GitHub Actions covering core QA, admin journey, diagnosis, portal access, security, control-room reconciliation, pre-marketing checks, production runtime and live booking runtime

The repository remains the intended source of truth for application and migration code. Every production database change made during this readiness execution has been mirrored to PR #95.

---

## 3. Core workflow

**Traffic**  
→ public Nexus pages  
→ **AI Opportunity Snapshot / Fit Call**  
→ governed lead + attribution  
→ **Client workspace**  
→ discovery context + evidence packet  
→ **Diagnosis execution**  
→ structured findings / baselines / opportunities / recommended actions  
→ human review / revision / approval  
→ **diagnosis orchestration**  
→ project + opportunities + tasks + document requests + approvals + metrics + milestones  
→ dependency-aware execution  
→ evidence / review / completion  
→ improvement measurement.

A controlled QA diagnosis previously proved the atomic approval/orchestration transition. During this readiness run, an additional isolated QA scenario proved diagnosis action-template mapping and prerequisite behavior without touching Moon Wax or other real client data.

---

## 4. Changes implemented in this execution

### MR-SEC-01 — Reduced anonymous SECURITY DEFINER exposure

Removed unnecessary anonymous EXECUTE access from Nexus functions identified by the Supabase Security Advisor, including admin diagnosis and inbox-related functions. Internal authorization checks already existed; the ACL change reduced exposed surface area.

**Production:** `20260903074430_nexus_revoke_anon_security_definer_execute`  
**Repository:** `supabase/migrations/20260903_nexus_revoke_anon_security_definer_execute.sql`

**Verification:** the Nexus anonymous-definer warnings found at baseline no longer appear in the current Security Advisor output.

### MR-OPS-01 — Added governed failed-email recovery

Added admin-only recovery functions:

- `nexus_admin_retry_failed_email(uuid)`
- `nexus_admin_requeue_unverified_domain_failures()`

They require the existing Nexus platform-admin check, deny anonymous execution, and allow the stranded Resend-domain cohort to be safely requeued after the sender domain is fixed.

**Production:** `20260903075725_nexus_admin_email_retry_controls`  
**Repository:** `supabase/migrations/20260903_nexus_admin_email_retry_controls.sql`

### MR-DIAG-01 — Removed transcript-only diagnosis wording

The stable template code `diagnosis_review_transcript` remains unchanged for compatibility, but its user/model-facing title is now **Review discovery evidence** and its description is evidence-packet/file-agnostic.

**Production:** `20260903075843_nexus_file_agnostic_discovery_template`  
**Repository:** `supabase/migrations/20260903_nexus_file_agnostic_discovery_template.sql`

### MR-ORCH-01 — Enforced diagnosis-generated prerequisite links

Updated `private.nexus_map_diagnosis_action_templates(uuid)` so that, after mapping diagnosis-generated actions to standardized templates, it also applies package prerequisite relationships when:

- both tasks exist in the same diagnosis run;
- both belong to the same company;
- both belong to the same project;
- the dependency rule is unambiguous; and
- the prerequisite task exists exactly once.

The mapper never invents a missing prerequisite and never links across clients/runs/projects. It now records:

- `template_mapped_actions`
- `template_dependencies_applied`
- `template_dependencies_missing`

Dependent action-template descriptions also expose prerequisite semantics to the diagnosis model. If accepted evidence or previously completed work already satisfies a prerequisite, the model is instructed not to generate redundant work.

Production migration sequence:

- `nexus_diagnosis_action_dependencies`
- `nexus_diagnosis_action_dependencies_alias_fix`
- `nexus_diagnosis_action_dependencies_uuid_fix`

Repository mirrors:

- `supabase/migrations/20260903_nexus_diagnosis_action_dependencies.sql`
- `supabase/migrations/20260903_nexus_diagnosis_action_dependencies_alias_fix.sql`
- `supabase/migrations/20260903_nexus_diagnosis_action_dependencies_uuid_fix.sql`

### MR-QA-01 — Added live booking runtime gate

Added `.github/workflows/booking-runtime-smoke.yml`.

It requires production to return:

- HTTP 200
- `ok:true`
- `configured:true`
- a `slots` payload

and preserves failure evidence as a workflow artifact.

**Current result:** FAIL — production returns HTTP 503 / `configured:false`.

### MR-DATA-01 — Removed synthetic QA contamination

Removed only explicitly synthetic Snapshot revenue-lead records (`QA *` companies with `qa-*@example.com`) and reclassified synthetic failed `@example.com` email records as cancelled/QA-only. No real lead/client record was deleted.

Current email outbox state:

- **42 failed** — real Resend domain-verification failures
- **4 cancelled**
- **0 active synthetic QA failures**

---

## 5. Dependency QA evidence — PASSED

A synthetic diagnosis run was created only inside **Nexus QA Sandbox**, then deleted after assertions.

### Nexus-owned chain

Three synthetic diagnosis actions mapped to:

1. `diagnosis_review_transcript` — Review discovery evidence
2. `diagnosis_map_workflow` — Map current workflow
3. `diagnosis_bottlenecks` — Identify bottlenecks and friction

Result:

- `template_mapped_actions = 3`
- `template_dependencies_applied = 2`
- `template_dependencies_missing = 0`

The resulting graph was:

**Review discovery evidence**  
→ **Map current workflow**  
→ **Identify bottlenecks and friction**

### Client-owned unlock behavior

A separate synthetic client pair mapped to:

**Confirm top business goals**  
→ **Complete discovery meeting**

Before prerequisite completion, the client action-context engine returned:

- downstream state: `UPCOMING`
- `prerequisites_satisfied = false`
- blocker: Confirm top business goals
- no cycle detected

After completing the prerequisite through the governed Nexus admin transition, the downstream action returned:

- downstream state: `WAITING_ON_YOU`
- `prerequisites_satisfied = true`
- no blocking task
- no cycle detected

This proves the expected DAG behavior: incomplete prerequisites remain Upcoming; completing the prerequisite unlocks the dependent action.

### Cleanup

After the assertion:

- remaining synthetic diagnosis run: **0**
- remaining synthetic tasks: **0**
- remaining synthetic activity records: **0**

No Moon Wax record was changed by this test.

---

## 6. Release-gate status

| Gate | Status | Current evidence |
|---|---|---|
| A — Public conversion | **FAIL** | Snapshot/public funnel is live, but fit-call booking returns HTTP 503 because production Calendar configuration is absent. |
| B — Authentication / tenancy | **PASS WITH P1 HARDENING** | RLS, tenancy boundaries and client-update guards are present; security/admin QA is green. Supabase leaked-password protection remains disabled. |
| C — Discovery | **PASS** | Evidence-first Step 2 redesign is merged and the real-client diagnosis lane has executed successfully. |
| D — Diagnosis | **PASS** | Production diagnosis runs have structured results and no execution error; Moon Wax remains at human review. |
| E — Orchestration | **PASS** | Atomic orchestration exists; standardized prerequisite mapping and client blocked→unlock behavior were proven in isolated QA. |
| F — Client execution | **PASS / PARTIAL BROWSER EVIDENCE** | Task lifecycle, dependency state engine, evidence/review flow and admin transitions are operational; a fresh full authenticated browser session was not available from this control runtime. |
| G — Admin operation | **PASS** | Admin Journey QA and Control Room Reconciliation are green; governed email recovery was added. |
| H — Communications | **FAIL — P0** | 42 real emails remain failed because the Resend production sender domain is unverified. |
| I — Security | **PASS FOR P0** | Parallel Security QA is green; no credible Nexus cross-tenant P0 found; baseline anonymous-definer exposure reduced. |
| J — Reliability | **FAIL — P0 DEPENDENCIES** | Email provider configuration and booking configuration are not healthy. |
| K — CI | **PASS EXCEPT EXPECTED BOOKING FAILURE** | Application/admin/security/diagnosis/control-room gates are green; booking runtime correctly fails against the live defect. |
| L — Mobile | **PARTIAL** | Diagnosis/mobile and responsive admin contracts are green; no fresh full authenticated physical-device regression from this control runtime. |
| M — Red team | **FAIL** | Live booking and email failures are sufficient to deny launch approval. |

---

## 7. Remaining P0/P1 backlog

### NX-MR-P0-01 — Verify production sender domain in Resend

**Evidence:** 42 outbox records failed with Resend HTTP 403 because `nexusintelligence.live` is not verified.  
**Required action:** verify the production sender domain/DNS in Resend.  
**After verification:** invoke the governed domain-failure requeue, confirm provider message IDs, confirm real delivery, and require email health to recover.  
**Owner:** founder / DNS + Resend account owner.  
**Status:** BLOCKED ON EXTERNAL CONFIGURATION.

### NX-MR-P0-02 — Configure production Google Calendar booking

**Evidence:** live booking runtime smoke returns HTTP 503 / `configured:false`.  
**Required production values:**

- `GOOGLE_CALENDAR_CLIENT_EMAIL`
- `GOOGLE_CALENDAR_PRIVATE_KEY`
- at least one of:
  - `NEXUS_CALENDAR_ID`
  - `GOOGLE_CALENDAR_ID`
  - `GOOGLE_CALENDAR_IMPERSONATE`

Review these optional runtime values as well:

- `NEXUS_BOOKING_TIMEZONE` — default `America/New_York`
- `NEXUS_BOOKING_DURATION_MINUTES` — default `20`
- `NEXUS_BOOKING_MIN_LEAD_HOURS` — default `12`
- `NEXUS_BOOKING_WALL_TIMES` — default `10:00,11:30,14:00,15:30`

The service account/calendar target must allow FreeBusy plus event create/update/delete behavior used by Nexus.

**After configuration:** rerun the live booking gate and complete one controlled book/reschedule/cancel test.  
**Owner:** founder / Cloudflare + Google Calendar account owner.  
**Status:** BLOCKED ON EXTERNAL CONFIGURATION.

### NX-MR-P1-01 — Enable Supabase leaked-password protection

**Evidence:** current Supabase Auth Security Advisor warning.  
**Required action:** enable leaked-password protection in Supabase Auth and retest password flows.  
**Owner:** founder / Supabase Auth configuration.  
**Status:** OPEN.

---

## 8. P2/P3 backlog

Do not let these displace the P0s:

- SMS provider remains unconfigured; in-app notification delivery remains available. Keep P2 unless SMS becomes contractual.
- Supabase performance advisor reports Nexus foreign-key index and RLS init-plan optimization opportunities.
- Review duplicate Nexus indexes before deleting any.
- Add required-status-check/branch protection to `main` as release-governance hardening.
- Expand full authenticated mobile browser/device E2E coverage.
- Add operator UI for email retry only if provider-recovery becomes a recurrent operational task; the governed recovery primitive now exists.

---

## 9. QA / security evidence

Current production/main gates are green for:

- Nexus Pre-Marketing QAQC
- Nexus Diagnosis Step 4 QA
- Nexus QA
- Nexus Portal Access Safety Gate
- Nexus Control Room Reconciliation QA
- Nexus Production Runtime Smoke

PR #95 has also produced green results for:

- Nexus Admin Journey QA
- Nexus Control Room Reconciliation QA
- Nexus Diagnosis Step 4 QA
- Nexus Parallel Security QA
- Nexus QA

The added live booking gate remains red because it correctly detects the current production configuration failure.

The latest Supabase Security Advisor sweep contains no recurrence of the Nexus anonymous SECURITY DEFINER warnings removed during this run. It still reports numerous authenticated SECURITY DEFINER functions across the shared database; these are not being mass-revoked because Nexus intentionally exposes authenticated RPC contracts with internal role/membership checks. Each must be treated according to its authorization contract rather than disabled indiscriminately.

---

## 10. Founder actions required before active marketing

1. **Resend:** verify `nexusintelligence.live` for the production sender.
2. **Cloudflare / Google Calendar:** add the required production Calendar credentials/target and validate service-account access.
3. **Supabase Auth:** enable leaked-password protection.

No founder action is required for:

- diagnosis dependency mapping;
- action-template prerequisite semantics;
- QA synthetic-data cleanup;
- Nexus anonymous-definer ACL hardening;
- failed-email recovery primitives;
- file-agnostic diagnosis template wording.

Those are implemented.

---

## 11. Marketing readiness

### Do not begin yet

- paid acquisition
- broad automated outreach
- large-volume partnership promotion
- campaigns that rely on automated email or self-service fit-call booking

### Safe to continue now

- founder-led sales preparation
- content / SEO preparation
- case-study development
- low-volume manually managed prospect conversations
- controlled product QA

Nexus can move from **NO-GO** to **CONDITIONAL GO** once:

1. Resend verification is complete and a real controlled email delivers;
2. the 42-domain-failure cohort is safely requeued/cleared;
3. production Calendar booking is configured and the live runtime gate passes; and
4. Supabase leaked-password protection is enabled.

A full **MARKET READY** verdict still requires the final authenticated client/admin browser regression and mobile-critical regression required by NEXUS-MR-1.0.

---

## 12. Immediate execution order

1. Founder completes Resend domain verification.
2. Founder configures Google Calendar production secrets/target in Cloudflare.
3. Founder enables Supabase leaked-password protection.
4. Engineering requeues the exact Resend-domain failure cohort and confirms delivery.
5. Re-run the booking runtime gate and perform controlled booking/reschedule/cancel QA.
6. Run final authenticated client/admin browser regression and mobile-critical flows.
7. Re-run the release matrix.
8. Only then promote PR #95 and update the verdict to Conditional Go / Market Ready as supported by evidence.

---

## 13. Verdict

**NEXUS INTELLIGENCE IS CURRENTLY: NO-GO FOR ACTIVE MARKETING.**

The application is not broadly broken. Diagnosis, evidence ingestion, task governance, prerequisite sequencing, portal/admin architecture, security controls and core orchestration are substantially operational. The remaining hard blockers are now narrow and proven: **production Resend sender verification and production Google Calendar booking configuration**. Supabase leaked-password protection remains a P1 hardening item before active marketing.
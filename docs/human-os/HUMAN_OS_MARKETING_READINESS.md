# Human OS Marketing Readiness Register

**Directive:** HOS-MKT-READY-1.0  
**As of:** 2026-09-03  
**Commercial authority:** Human OS Revenue Engine 2.0  
**Production:** https://human-leverage-os.vercel.app  
**Execution branch:** `human-os/pre-marketing-readiness-2026-09-03`  
**Draft PR:** #96  

## Executive state

**NOT READY** for broad marketing or paid acquisition.

The product has a functioning public shell, correct AI-era category direction, a substantial learning/data backend, governed analytics contracts, and a recoverable deployment history. It is not yet marketing-ready because production still serves mission-critical frontend assets through the Supabase `hlo-app` Edge Function, Human OS+ checkout is not enabled or validated against a confirmed Human OS Stripe account, public Terms/Privacy/robots/sitemap routes are missing in production, authenticated returning-user regression has not been closed, and the AI Guide evaluation suite has cases but no recorded release-candidate runs.

## Gate scorecard

| Gate | Status | Evidence / remaining work |
|---|---|---|
| G0 Source of Truth | PASS | Revenue Engine 2.0 governs category, CTA hierarchy, $29 founding price, and later-offer gates. Older Attention & Focus launch positioning is not authoritative where conflicting. |
| G1 Production Stability | FAIL | Current Vercel HTML is healthy, but CSS/JS still load from `hlo-app?asset=...`. Source-controlled static bundling fix is in PR #96 and CI passes; preview/promotion still required. |
| G2 Product | CONDITIONAL | Learning/auth/Tutor schema and functions exist. No completed authenticated returning-user regression and `hlo_ai_guide_eval_runs` is empty. |
| G3 Revenue | FAIL | Billing code/schema exists but production public offer does not expose active checkout; billing entitlement/webhook tables are empty; connected Stripe context is not confirmed as the Human OS account. |
| G4 Measurement | CONDITIONAL | 25 governed event contracts and 15 metric definitions exist. 321 events were observed, but 311 are synthetic; real production events currently prove only session/visitor qualification, not the full learning-to-paid funnel. |
| G5 Trust | FAIL | Backend export/deletion exists and HLO tables use RLS. Production `/terms` and `/privacy` return 404; leaked-password protection remains disabled; staging uploader source contained a hardcoded credential. Plus-entitlement cross-user lookup was fixed in production on 2026-09-03. |
| G6 Conversion & Discoverability | FAIL | Homepage category/CTAs are directionally correct, but production `/robots.txt` and `/sitemap.xml` return 404 and founding price is not currently displayed as $29/month. PR #96 builds these surfaces. |
| G7 Full-System QA | FAIL | Static-build CI passes, but no complete production/preview authenticated, commerce, mobile, accessibility, and analytics reconciliation regression has been executed for the candidate. |

## Canonical execution register

| ID | Source | Requirement | Current state | Owner | Status | Evidence | Dependency | Marketing blocker |
|---|---|---|---|---|---|---|---|---|
| HOS-001 | Revenue Engine 2.0 | AI-era capability positioning | Live homepage uses AI-era capability promise | Lead | Verified | Production HTML | none | No |
| HOS-002 | Revenue Engine 2.0 | Primary CTA = Build My Learning Path | Hero CTA correct; header wording repaired in candidate | Product | Implemented | PR #96 | preview QA | Yes |
| HOS-003 | Revenue Engine 2.0 | Founding Human OS+ = $29/month | Production omits price; candidate displays $29/month | Revenue | Implemented | PR #96 | preview QA | Yes |
| HOS-004 | Recovery | Bundle mission-critical CSS/JS with app | Production still loads CSS/JS from Supabase Edge | Platform | Implemented | PR #96 + successful Human OS Static Build QA | preview + promotion | Yes |
| HOS-005 | Trust/SEO | Terms route | Production 404; candidate generates route from current signup notice | Trust | Implemented | PR #96 | owner/legal review + preview | Yes |
| HOS-006 | Trust/SEO | Privacy route | Production 404; candidate generates route from current signup notice | Trust | Implemented | PR #96 | owner/legal review + preview | Yes |
| HOS-007 | SEO | robots.txt | Production 404; candidate generates file | Growth | Implemented | PR #96 | preview + promotion | Yes |
| HOS-008 | SEO | sitemap.xml | Production 404; candidate generates file | Growth | Implemented | PR #96 | preview + promotion | Yes |
| HOS-009 | Security | Prevent cross-user Plus entitlement probing | Production function hardened and anon execution revoked | Security | Verified | Supabase migration `human_os_plus_membership_privacy` | none | No |
| HOS-010 | Security | Remove hardcoded stage-upload credential | Secure source version added using `HLO_STAGE_SECRET` | Security | Implemented | PR #96 | secret rotation + function deploy | Yes |
| HOS-011 | Auth | Returning-user journey | Backend state tables/RLS present | Lifecycle | Not verified | No end-to-end authenticated regression | test account/preview | Yes |
| HOS-012 | Commerce | Correct Human OS Stripe account | Connected Stripe context is labeled for Statecraft, not conclusively Human OS | Revenue | Blocked | Connected Stripe account context | owner/account confirmation | Yes |
| HOS-013 | Commerce | Checkout → webhook → entitlement → cancellation | Billing implementation exists; zero observed entitlement/webhook rows | Revenue | Not verified | Supabase billing tables | HOS-012 | Yes |
| HOS-014 | Analytics | Governed event taxonomy | 25 event contracts, 15 metric definitions | Data | Verified | Supabase analytics tables | none | No |
| HOS-015 | Analytics | Real end-to-end funnel telemetry | Only 10 non-synthetic events observed; session/visitor only | Data | Partial | `hlo_analytics_events` | real journey QA | Yes |
| HOS-016 | AI Guide | Persistent evaluation suite | 50 cases exist | Learning | Implemented | `hlo_ai_guide_eval_cases` | none | No |
| HOS-017 | AI Guide | Release-candidate eval run | 0 runs recorded | Learning | Not verified | `hlo_ai_guide_eval_runs` | authenticated/eval runner access | Yes |
| HOS-018 | Privacy | Account export/delete | UI and backend delete/export implementation present | Trust | Implemented | `privacy-ui.js`, `hlo-account-delete` | destructive QA account | Yes |
| HOS-019 | Security | Supabase leaked-password protection | Advisor reports disabled | Security | Blocked | Supabase security advisor | Auth configuration change | Yes |
| HOS-020 | Retention | D7/D30/D60 evidence | Not mature / not established | Product Growth | Gated | Requires real cohort elapsed time | all implementation gates first | Paid-scale only |

## Production evidence snapshot

- Vercel project: `prj_5aLXelAQIutHyVALuf9XlRFdD8fG`
- Current production deployment inspected: `dpl_GrZiUJ8uKDEviwr5KfH285pgPYx9`
- Vercel deployment history exposes at least 18 Human OS deployments, including recovery references.
- Human OS frontend recovery assets exist in GitHub under historical Human OS build paths and `hlo-release/app.b64`.
- Candidate branch is six commits ahead of `main` at PR creation; Human OS Static Build QA run #1 completed successfully.
- Production Supabase migration `human_os_plus_membership_privacy` applied and verified on 2026-09-03.

## Manual / external dependencies

### MANUAL-001 — Human OS Stripe account confirmation
Confirm/connect the Stripe account that is actually intended to collect Human OS revenue. The currently connected context is labeled for Statecraft. This blocks any real Human OS checkout, webhook, entitlement, cancellation, refund, and revenue reconciliation test.

### MANUAL-002 — Final Terms/Privacy approval
The candidate publishes the same Terms and Privacy notices already shown during Human OS signup so the product no longer has dead public policy routes. Final owner/legal review is still required before broad paid acquisition.

### MANUAL-003 — Rotate staging credential / set `HLO_STAGE_SECRET`
Create a new staging-upload secret in Supabase and deploy the source-controlled `hlo-stage-upload` function. The previous implementation embedded a credential in function source; that credential should be considered exposed and retired.

### MANUAL-004 — Enable Supabase leaked-password protection
Turn on the Supabase Auth leaked-password protection setting. The security advisor currently reports it disabled.

## Time-dependent evidence

D7/D30/D60 retention and 60-day paid retention cannot be manufactured by QA. Once G1-G7 implementation blockers are closed, enroll a bounded validation cohort with complete telemetry. Paid-scale readiness remains gated until Revenue Engine 2.0 evidence thresholds are genuinely met.

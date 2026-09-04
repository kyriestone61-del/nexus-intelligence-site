# Human OS Marketing Readiness Register

**Release candidate:** PR #96 / `human-os/pre-marketing-readiness-2026-09-03`
**Commercial authority:** Human OS Revenue Engine 2.0

## Gate status

| Step | Status | Evidence / blocker |
|---|---|---|
| 1. Vercel preview | BLOCKED | GitHub Actions run 33926847795 remains blocked at the Vercel-token requirement. The preview Tutor backend is independently deployed and evaluated; a frontend preview is still required. |
| 2. Desktop/mobile/auth regression | BLOCKED | Requires the actual Vercel preview URL. Static candidate build/syntax QA passes. |
| 3. Human OS Stripe | BLOCKED | Only the Statecraft-labeled Stripe context has been exposed to the connected tooling; do not reuse it for Human OS. |
| 4. Checkout/webhook/entitlement/cancel | BLOCKED | Depends on the correct Human OS Stripe account. Plus entitlement primitives exist; additional backend boundaries must be activated with commerce rather than breaking free production users before checkout exists. |
| 5. AI Guide release evaluation | PASS | Run `998eda56-467b-44b3-92ac-2756aa631149`: 50/50 passed, zero critical failures, zero evaluator errors. Preview `hlo-tutor-stream` v12; all verdict criteria and supplied context verified. See `human-os/ai-guide-evaluation-2026-09-04.md`. |
| 6. Trust/legal | PARTIAL | Production Plus entitlement privacy hardening and staging credential fix are live. Candidate has Terms/Privacy/robots/sitemap. Supabase leaked-password protection remains disabled and Terms/Privacy still require explicit owner/legal approval. |
| 7. Promote candidate | BLOCKED | Do not promote while Steps 1–6 are blocked. |
| 8. Production smoke/analytics | BLOCKED | Runs only after promotion. |
| 9. Controlled validation cohort | BLOCKED | Runs only after production release gates pass. |

## Current verified static artifact

- Verified code SHA: `db3465fd22a883d31df7f013152217f0d5eb55bb`
- Human OS Static Build QA: run `33926847804` — PASS
- Human OS Tutor Response Contract: run `33926847794` — PASS (11 tests)
- Artifact ID: `9957102199`
- Artifact: `human-os-static-db3465fd22a883d31df7f013152217f0d5eb55bb`
- Artifact digest: `sha256:599b4bec3ba604ba7820ca29ac8d7bef427bbe22e6736a437e07ca45443fd48d`

## Revenue Engine 2.0 value/retention implementation

The release candidate now explains the recurring $29/month value as continuity rather than a static content paywall:

- Living Learning Path
- context-aware AI Tutor
- evidence that compounds over time
- progress / next-action intelligence
- current AI research context

Candidate Free/Plus behavior now loads the authoritative `hlo_is_plus_member` state. The preview gates additional personalized path generation and Living Path recalibration for non-owner Free users. `hlo-tutor-stream` v12 authoritatively enforces the documented Tutor usage boundary: 25 Free user turns/month, 200 Plus turns/month, owner bypass. Tutor-limit events surface a `paywall_viewed` signal in the preview.

These changes remain preview/candidate scoped where needed. Production `hlo-tutor` is unchanged. Do not activate broader Plus server restrictions in production until Human OS checkout and entitlement lifecycle are available, or free users could be blocked from a feature with no valid upgrade path.

## Backend changes already live

- `hlo_is_plus_member` hardened: anonymous execution revoked; authenticated callers cannot query another user’s entitlement; service role retained.
- `hlo-stage-upload` v4: no embedded staging credential; fails closed without `HLO_STAGE_SECRET`.
- `hlo-tutor-stream` v12: non-production AI-era Tutor candidate using the governed model proxy, JWT verification, prompt-injection protection, deterministic medical/financial boundaries, source sanitization, and 25/200 monthly Tutor-turn limits.
- AI Guide `ai-guide-v2` corpus: 50 current-product cases (25 critical, 25 high) across grounding, prerequisites, productive struggle, difficulty adaptation, routing, prompt injection, medical boundary, financial boundary, source fidelity, and privacy/personalization.
- The existing `hlo-v2-preview` evaluation slot now runs the source in `supabase/functions/hlo-eval-batch/index.ts`. Its one-shot `human_os_eval_runner` trigger is disabled after testing. Earlier failed/inconclusive results are retained; the authoritative completed run is listed above.

## Explicit owner/account dependencies

1. Add GitHub Actions secret `VERCEL_TOKEN` with access to Human OS Vercel project `prj_5aLXelAQIutHyVALuf9XlRFdD8fG` in team `team_WLlQMnubiRGw1kzazsHcKGfv`.
2. Connect/expose the Stripe account that will actually own Human OS revenue.
3. Enable Supabase Auth leaked-password protection.
4. Approve the candidate Terms and Privacy wording (or obtain counsel approval).

A separate Vercel AI Gateway key is no longer an owner dependency for the Tutor candidate; the governed model-proxy path exists. The AI Guide release gate passed for preview Tutor v12. This synthetic Tutor evaluation does not replace authenticated frontend, commerce, privacy, or production release QA.

## Release rule

PR #96 remains draft. Do not merge or promote the static frontend while any of Steps 1–6 above are blocked. Do not build or launch the $499 Sprint, Team offers, or Practitioner program during this tranche; Revenue Engine 2.0 gates those after the individual Human OS+ loop is validated.

## Tutor and evaluator repairs verified September 4

- Reject structured values in text fields instead of displaying `[object Object]`.
- Provide the judge the same explicit synthetic context as the Tutor; require boolean passing criteria.
- Align the synthetic recommendation with the current unfinished lesson, rather than a completed module.
- Preserve assessment reasoning through attempt-first scaffolding and route prerequisite-skipping requests to the unfinished foundation.
- Preserve allowlisted context citations in supported model response formats.
- Production `hlo-tutor` remains version 10, deployment hash `5af102612dfb8a342f921387b5e1d3498a5669ee4dde500fbc055ba6935feee5`.

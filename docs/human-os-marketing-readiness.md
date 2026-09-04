# Human OS Marketing Readiness Register

**Release candidate:** PR #96 / `human-os/pre-marketing-readiness-2026-09-03`
**Commercial authority:** Human OS Revenue Engine 2.0

## Gate status

| Step | Status | Evidence / blocker |
|---|---|---|
| 1. Vercel preview | BLOCKED | Current Human OS Preview Deploy run #18 reaches the explicit `Require Vercel token` guard and stops because GitHub Actions still has no `VERCEL_TOKEN`. Project/team targeting is already encoded. |
| 2. Desktop/mobile/auth regression | BLOCKED | Requires the actual Vercel preview URL. Static candidate build/syntax QA passes. |
| 3. Human OS Stripe | BLOCKED | Only the Statecraft-labeled Stripe context has been exposed to the connected tooling; do not reuse it for Human OS. |
| 4. Checkout/webhook/entitlement/cancel | BLOCKED | Depends on the correct Human OS Stripe account. Plus entitlement primitives exist; additional backend boundaries must be activated with commerce rather than breaking free production users before checkout exists. |
| 5. AI Guide release evaluation | BLOCKED | AI Guide v2 has 50 current-product cases. `hlo-tutor-stream` v6 is the non-production AI-era Tutor candidate and uses the governed model proxy. The latest attempted run `c9f667b4-b0d3-4eb2-a8f5-a5ba61afca93` was closed inconclusive because the model-judge proxy returned HTTP 502 before any result rows were recorded. No false pass. |
| 6. Trust/legal | PARTIAL | Production Plus entitlement privacy hardening and staging credential fix are live. Candidate has Terms/Privacy/robots/sitemap. Supabase leaked-password protection remains disabled and Terms/Privacy still require explicit owner/legal approval. |
| 7. Promote candidate | BLOCKED | Do not promote while Steps 1–6 are blocked. |
| 8. Production smoke/analytics | BLOCKED | Runs only after promotion. |
| 9. Controlled validation cohort | BLOCKED | Runs only after production release gates pass. |

## Current verified static artifact

- Head SHA: `ccc67a3e5937abcec60845139a61cd6e3073ce5e`
- Human OS Static Build QA: run #21 — PASS
- Artifact ID: `9944462683`
- Artifact: `human-os-static-ccc67a3e5937abcec60845139a61cd6e3073ce5e`
- Artifact digest: `sha256:c907b46fc39c0c537c024fa68f9fbb9c75a9d9e3a22c9949d17cce895d6fcdd6`

## Revenue Engine 2.0 value/retention implementation

The release candidate now explains the recurring $29/month value as continuity rather than a static content paywall:

- Living Learning Path
- context-aware AI Tutor
- evidence that compounds over time
- progress / next-action intelligence
- current AI research context

Candidate Free/Plus behavior now loads the authoritative `hlo_is_plus_member` state. The preview gates additional personalized path generation and Living Path recalibration for non-owner Free users. `hlo-tutor-stream` v6 authoritatively enforces the documented Tutor usage boundary: 25 Free user turns/month, 200 Plus turns/month, owner bypass. Tutor-limit events surface a `paywall_viewed` signal in the preview.

These changes remain preview/candidate scoped where needed. Production `hlo-tutor` is unchanged. Do not activate broader Plus server restrictions in production until Human OS checkout and entitlement lifecycle are available, or free users could be blocked from a feature with no valid upgrade path.

## Backend changes already live

- `hlo_is_plus_member` hardened: anonymous execution revoked; authenticated callers cannot query another user’s entitlement; service role retained.
- `hlo-stage-upload` v4: no embedded staging credential; fails closed without `HLO_STAGE_SECRET`.
- `hlo-tutor-stream` v6: non-production AI-era Tutor candidate using the governed model proxy, JWT verification, prompt-injection protection, deterministic medical/financial boundaries, source sanitization, and 25/200 monthly Tutor-turn limits.
- AI Guide `ai-guide-v2` corpus: 50 current-product cases (25 critical, 25 high) across grounding, prerequisites, productive struggle, difficulty adaptation, routing, prompt injection, medical boundary, financial boundary, source fidelity, and privacy/personalization.
- Temporary evaluation runner was removed/restored after the failed judge-infrastructure attempt. `hlo-v2-preview` is back to its normal cached-HTML implementation; there are zero open `ai-guide-v2` runs and no temporary evaluator configuration row.

## Explicit owner/account dependencies

1. Add GitHub Actions secret `VERCEL_TOKEN` with access to Human OS Vercel project `prj_5aLXelAQIutHyVALuf9XlRFdD8fG` in team `team_WLlQMnubiRGw1kzazsHcKGfv`.
2. Connect/expose the Stripe account that will actually own Human OS revenue.
3. Enable Supabase Auth leaked-password protection.
4. Approve the candidate Terms and Privacy wording (or obtain counsel approval).

A separate Vercel AI Gateway key is no longer an owner dependency for the Tutor candidate; the governed model-proxy path exists. The AI Guide release gate remains blocked on evaluator/proxy reliability, not missing owner credentials.

## Release rule

PR #96 remains draft. Do not merge or promote the static frontend while any of Steps 1–6 above are blocked. Do not build or launch the $499 Sprint, Team offers, or Practitioner program during this tranche; Revenue Engine 2.0 gates those after the individual Human OS+ loop is validated.

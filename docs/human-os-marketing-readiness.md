# Human OS Marketing Readiness Register

**Release candidate:** PR #96 / `human-os/pre-marketing-readiness-2026-09-03`

## Gate status

| Step | Status | Evidence / blocker |
|---|---|---|
| 1. Vercel preview | BLOCKED | Preview workflow is implemented and linked to the exact Human OS Vercel project/team, but GitHub Actions has no `VERCEL_TOKEN`; run #8 fails at the explicit token guard before deployment. |
| 2. Desktop/mobile/auth regression | BLOCKED | Requires an actual preview URL. Static candidate build and syntax checks pass. |
| 3. Human OS Stripe | BLOCKED | Only `statecraft-nine.vercel.app` Stripe account is currently exposed; do not reuse it for Human OS. |
| 4. Checkout/webhook/entitlement/cancel | BLOCKED | Depends on correct Human OS Stripe account. |
| 5. AI Guide release evaluation | BLOCKED | AI Guide v2 50-case corpus is live. Preview AI-era Tutor exists at `hlo-tutor-stream`, but configured AI Gateway credential returns 401 Unauthorized. All attempted v2 runs are recorded as inconclusive; no false pass. |
| 6. Trust/legal | PARTIAL | Production Plus entitlement privacy fix and staging credential fix are live. Candidate has public Terms/Privacy/robots/sitemap. Supabase native leaked-password protection remains disabled; legal copy still needs owner/legal approval. |
| 7. Promote candidate | BLOCKED | Do not promote until Steps 1–6 pass. |
| 8. Production smoke/analytics | BLOCKED | Runs only after promotion. |
| 9. Controlled validation cohort | BLOCKED | Runs only after production release gates pass. |

## Current verified static artifact

- Head SHA: `99e4f175c0362d020b1fd9aed95868bbda2bd7c3`
- Human OS Static Build QA: run #11 — PASS
- Artifact: `human-os-static-99e4f175c0362d020b1fd9aed95868bbda2bd7c3`
- Artifact digest: `sha256:bc113b98ffa222525d25823416ace05fa365e472613dff9cb48cfac5b624f001`

## Backend changes already live

- `hlo_is_plus_member` hardened: anonymous execution revoked; authenticated callers cannot query another user’s entitlement; service role retained.
- `hlo-stage-upload` v4 deployed: no embedded staging credential; fails closed without `HLO_STAGE_SECRET`.
- `hlo-tutor-stream` repurposed as the non-production AI-era Tutor candidate; production `hlo-tutor` remains unchanged until evaluation passes.
- AI Guide `ai-guide-v2` corpus: 50 current-product cases (25 critical, 25 high) across grounding, prerequisites, productive struggle, difficulty adaptation, routing, prompt injection, medical boundary, financial boundary, source fidelity and privacy/personalization.
- Temporary evaluation runner slot was restored after testing; no test-only unauthenticated runner remains deployed.

## Explicit owner/account dependencies

1. Add GitHub Actions secret `VERCEL_TOKEN` with access to Human OS Vercel project `prj_5aLXelAQIutHyVALuf9XlRFdD8fG` in team `team_WLlQMnubiRGw1kzazsHcKGfv`.
2. Connect/expose the Stripe account that will actually own Human OS revenue.
3. Create/rotate a valid Vercel AI Gateway API key and set Supabase Edge Function secret `AI_GATEWAY_API_KEY`.
4. Enable Supabase Auth leaked-password protection.
5. Approve the candidate Terms and Privacy wording (or obtain counsel approval).

## Release rule

PR #96 remains draft. Do not merge or promote the static frontend while any of Steps 1–6 above are blocked.

# Nexus Infrastructure Map (verified)

Written from direct evidence gathered on 2026-09-02 — DNS lookups, HTTP response headers, and cross-referencing the live site's served content against this repository. No secrets are recorded here (only the client-safe publishable key format, which is meant to be public). This document reflects **actual current state**, not the migration plan's intended end-state — see the discrepancy noted at the bottom.

## Verified chain

```
nexusintelligence.live
  └─ DNS: nameservers piotr.ns.cloudflare.com / mona.ns.cloudflare.com
       (domain's DNS is fully delegated to Cloudflare)
  └─ Resolves to Cloudflare's proxy IPs (104.21.73.133, 172.67.145.12 — anycast,
     not an origin IP; Cloudflare's proxy is in front of the real origin)
  └─ HTTP response: `server: cloudflare`, cache/CSP headers consistent with
     Cloudflare Pages + Pages Functions (this repo's `functions/_middleware.js`
     and `functions/api/*` match that convention)
  └─ Serves this exact repository's code — confirmed three independent ways:
       1. `src="/app.js"` present in the live page, matching this repo's app.js
       2. `/assets/kyrie-stone-founder-primary.webp` appears on the live page,
          byte-identical path to this repo's assets/ folder
       3. The live response's Content-Security-Policy header is IDENTICAL to
          the CSP hardcoded in this repo's portal.html (same Supabase host,
          same HubSpot domains)
  └─ kyriestone61-del/nexus-intelligence-site, branch `main`, GitHub as
     source of truth (confirmed: 425 commits, 34 CI workflows, this is an
     actively maintained repo, not a stale mirror)
       └─ Supabase project: dmdgkjksouhhsuojthav.supabase.co
            (found hardcoded — as the client-safe publishable key, not a
            secret — in portal-client.js, launch-readiness.js,
            operations.js, and others)
       └─ Third-party: HubSpot (script + API domains allowed in CSP:
            js.hs-scripts.com, *.hubspot.com, *.hubapi.com) — marketing/CRM
            integration, not yet otherwise investigated.
```

## What this confirms

- **The live site is genuinely served from `kyriestone61-del/nexus-intelligence-site`'s `main` branch** — not a stale deployment, not a different repo. The evidence above (matching CSP, matching asset paths, matching script references) rules out coincidence.
- **Cloudflare is the actual production host today** — DNS, proxying, and response headers all point to Cloudflare, not Vercel. Read together with `CLOUDFLARE_MIGRATION.md`'s cutover checklist, the migration described there appears to already be **complete or substantially complete** in practice, even though the README still says "Production updates are managed through version-controlled commits and Vercel deployment." That line is stale and worth updating once you confirm Vercel is fully retired.
- **Supabase backend is `dmdgkjksouhhsuojthav.supabase.co`** — this is the project to use for all future Auth/RLS/Storage/schema work on canonical Nexus. (Explicitly not the same project as the separate Claude 2.0 build.)

## What's not yet verified (needs Cloudflare account access)

- The exact Cloudflare Pages project name, its build configuration, environment variables, and deployment history — none of this is visible from outside the Cloudflare dashboard/API. DNS and HTTP headers confirm *that* Cloudflare is serving it, not the project's internal configuration.
- Whether the Vercel deployment path is still live as a rollback target, or has been fully retired.
- HubSpot's actual role/configuration (marketing automation? forms? CRM sync?) — only its allowed domains are visible from the CSP header.

## Discrepancies to flag to the owner

1. README.md still describes Vercel as the deployment target; actual evidence says Cloudflare. Worth a doc update once confirmed.
2. `Nexus QA` GitHub Actions workflow is currently **failing on `main`** (see the separate PR opened for this) — a regression check expects `industries.html` to contain `"appointment-based beauty business"`, which the most recent commit ("Phase 6") appears to have removed.

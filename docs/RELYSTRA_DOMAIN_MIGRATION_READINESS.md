# RELYSTRA domain migration readiness

## Current decision

The production origin remains `https://nexusintelligence.live` until a final RELYSTRA domain is owned, attached to Cloudflare Pages, and verified end to end. No replacement domain is assumed by this plan.

The current domain must remain available throughout cutover as a rollback path and, after acceptance, as a permanent redirect source for existing links.

## Application inventory

| Surface | Current source of truth | Cutover action |
| --- | --- | --- |
| Public origin | `functions/_middleware.js` and deployed hostname | Add the final hostname to Cloudflare before changing canonical output. |
| Canonical and social URLs | Middleware-generated canonical, Open Graph, and Twitter metadata | Change to the final HTTPS origin only after the new hostname passes public and authenticated smoke tests. |
| Sitemap and robots | `functions/sitemap.xml.js`, `functions/robots.txt.js` | Publish the final origin, then submit the new sitemap. Keep the old sitemap redirecting. |
| Portal redirects | Browser flows derive from `location.origin`; server defaults use the current origin | Add the final `/portal` URL to every allowlist before cutover. |
| Supabase Auth | Dashboard Site URL and redirect allowlist | Add the new portal redirect, verify sign-up, recovery, and sign-in, then promote the new Site URL. Do not remove the old origin until rollback expires. |
| Authentication email links | `functions/api/auth-email.js` and `supabase/functions/nexus-email-worker/auth-recovery*.ts` | Add the final origin to allowed origins and set the public-origin environment value. Test confirmation and recovery links. |
| Checkout return URLs | `RELYSTRA_PORTAL_ORIGIN` in the Checkout Edge Function | Set to the final origin and verify success/cancel returns preserve company and plan context. |
| Stripe webhooks | Supabase Edge Function destination | No public-domain change is expected; verify the configured endpoint and signing secret remain unchanged. |
| Transactional email/SMS links | `NEXUS_PUBLIC_ORIGIN` runtime setting | Point links to the final origin after the new hostname is verified. Retain the existing email address until a final-domain sender is authenticated. |
| CORS and CSP | `_headers`, Pages Functions, Supabase Edge Function origin validation | Add the new origin before switching traffic and confirm authenticated API requests on both origins during transition. |
| Cloudflare | Pages custom domains, DNS, TLS, redirects | Attach domain, wait for valid TLS, verify Pages routing, then configure an origin-preserving 301 from the old hostname. |
| Analytics and booking | Deployed integration settings | Add the hostname to allowed-domain and referral-exclusion settings; verify campaign and booking return paths. |
| OAuth callbacks | No first-party OAuth callback is currently part of the primary portal flow | Re-audit connected providers before cutover and add the final callback where any provider is enabled. |
| Environment variables | `RELYSTRA_PORTAL_ORIGIN`, `NEXUS_PUBLIC_ORIGIN`, Supabase Auth settings | Update preview first, then production. Record the old values for rollback. |

Internal `nexus_*` database, migration, function, and compatibility identifiers are not public branding and should not be renamed during domain cutover. Renaming them would add migration risk without changing the client experience.

## Controlled cutover

1. Owner confirms the exact domain and provides control of its DNS zone.
2. Attach the hostname to Cloudflare Pages and confirm valid TLS without changing the existing production domain.
3. Add the hostname to Supabase Auth, Pages/Edge CORS, CSP, analytics, booking, and any enabled OAuth allowlists.
4. Set preview runtime origins and verify public pages, sign-in, recovery email, Moon Wax company/project context, private files, diagnosis, Builds, and Stripe test Checkout return paths.
5. Promote the new runtime origins and canonical metadata to production.
6. Verify the same authenticated journey at the final hostname before advertising it.
7. Redirect the old hostname to the matching path and query on the new hostname. Preserve it long term for email, bookmarks, and historical links.
8. Monitor authentication errors, Checkout/webhook correlation, 4xx/5xx responses, and redirect loops. Roll back the runtime origins if a release-blocking error appears.

## Acceptance evidence required

- TLS and Cloudflare custom-domain status are healthy.
- Canonical, Open Graph, Twitter, robots, and sitemap output use the final origin.
- Sign-up, sign-in, sign-out, confirmation, and recovery links return to the correct portal.
- Direct portal links, browser back/forward, and refresh preserve company/project context.
- Private uploads and downloads remain tenant-scoped.
- Stripe test Checkout success and cancellation return to the correct engagement.
- Webhooks remain verified and idempotent.
- Old-domain paths redirect once, preserve path/query, and do not create authentication loops.
- Mobile public and authenticated critical paths pass on the final hostname.

## Owner action required

Confirm or acquire the final RELYSTRA domain and provide DNS ownership. No purchase or domain choice should be made by the release team without that commercial decision.

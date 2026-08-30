# Nexus Intelligence — Cloudflare Pages Migration

## Objective
Move the public Nexus website and client portal off Vercel Hobby onto Cloudflare Pages while preserving GitHub as the source of truth and Supabase as the authentication/database/storage backend.

## Cloudflare Pages project settings
- Source repository: `kyriestone61-del/nexus-intelligence-site`
- Production branch: `main`
- Framework preset: None / Static HTML
- Build command: `exit 0`
- Build output directory: `.`
- Root directory: repository root

## Included Cloudflare files
- `_redirects` — preserves dynamic service and industry detail routes.
- `_headers` — adds baseline security headers and disables caching/indexing for the authenticated portal.

## Cutover sequence
1. Create a Cloudflare Pages project by importing the GitHub repository above.
2. Deploy the `main` branch with the settings above.
3. Record the generated `*.pages.dev` production URL.
4. Verify these routes before changing authentication settings:
   - `/`
   - `/quick-scan`
   - `/assessment`
   - `/services`
   - `/services/ai-opportunity-assessment`
   - `/industries`
   - `/portal`
5. Update Supabase Authentication > URL Configuration:
   - Site URL = the Cloudflare production URL
   - Add redirect URL = `<Cloudflare production URL>/portal`
   - Keep the current Vercel portal redirect temporarily during transition until Cloudflare authentication is verified.
6. Test a fresh account signup, email confirmation, sign-in, workspace access, document upload/download, tasks, milestones, and metrics on Cloudflare.
7. Once verified, use Cloudflare as the public production host. Keep Vercel only as a temporary rollback target until the migration is accepted, then retire the Vercel production path before commercial launch.

## Portal authentication status
The portal now derives its signup confirmation redirect from the active origin (`${location.origin}/portal`) rather than a hard-coded Vercel hostname. That makes the browser-side auth flow host-agnostic. The Supabase Auth Site URL and redirect allowlist still must contain the final production origin before cutover, and a fresh-account confirmation test remains mandatory before retiring the rollback host.

## Runtime configuration that must be verified before launch
Cloudflare deployment alone does not configure the server-side integrations. Before the production cutover is accepted, verify the required runtime configuration for transactional email, booking/calendar access, and the Client Diagnosis Agent. A deployment is not considered launch-ready if the Nexus health dashboard reports those integrations as failed or degraded.

## Cost posture
This site is predominantly static, so Cloudflare Pages static asset delivery should remain on the free path. Supabase continues to provide authentication, database, private file storage, scheduled workers, and the secured Client Diagnosis Agent. Pages Functions/Workers should only be introduced when a feature actually requires server-side execution.

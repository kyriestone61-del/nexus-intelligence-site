# Human OS authentication separation — verified preview

The isolated preview is ready: https://human-leverage-knhj9z7v0-kyriestone61-7319.vercel.app

Production https://human-leverage-os.vercel.app has not been promoted and remains on the earlier backend. Use the isolated preview for the corrected recovery flow.

## Infrastructure and migration

- Separate Supabase project: jzoqzbmllpnwxxfmvize, us-east-1. Quoted $0/month.
- SMTP sender: Human OS <human-os@nexusintelligence.live>. Dedicated sending-only Resend key restricted to the verified domain; no secret stored in this report or source.
- Recovery email subject: Reset your Human OS password.
- Exact preview recovery callback allowed: /auth/recovery/.
- Migrated all 71 hlo_* tables, 9 views, 20 functions, 135 RLS policies, grants, indexes, validated foreign keys and triggers. Source/destination counts and canonical row checksums matched for all tables before synthetic testing.
- Copied only the Human OS learner's account and email identity, including its existing password hash and confirmed status. Sessions and recovery tokens were not migrated. Accounts now operate independently.
- Deployed five required Edge Functions to the new project. AI services use the existing server-side model proxy configuration.
- Statecraft's authentication and sender settings were unchanged.
- The previously approved empty Nexus Intelligence project jddiimczeeusfmjxqtjv was paused with data retained to free the free-project slot.

## Verification

- Separate preview deployment dpl_7UdPEvwYsDDdh5k1cKeBYDmTyErV reached READY.
- Synthetic account login, cloud sync, real Tutor response, persisted conversation, password-recovery completion, and sign-in with the changed password passed.
- Authenticated RLS checks showed zero other profiles or owner rows visible; owner and Plus privileges were false.
- Synthetic account and sessions were deleted. Temporary QA endpoint was disabled (410, gateway JWT verification enabled).
- Real learner reset email was requested from the new preview and confirmed Delivered by Resend at Sep 4, 8:38 PM. Sender and subject match Human OS. Email ID: 2f465cb9-0518-45d9-821c-449754a9fb17.
- The learner's real password was not changed by the agent. The recipient must use the delivered link to choose it.
- JavaScript syntax checks passed. New-account signup/confirmation was not tested end-to-end.

## Deployment notes and remaining release gates

Frontend source is in human-os-static; its build now runs auth-isolation-patch.mjs and emits the dedicated recovery screen. Browser runtime points to the separate backend. Build-time static assets still come from the SHA-pinned source asset snapshot.

Deployed backend source snapshots are in human-os-isolated/functions. They belong only to project jzoqzbmllpnwxxfmvize. Authenticated functions use explicit auth.getUser() checks; gateway verify_jwt is false for compatibility with the project's signing keys. hlo-public-event is intentionally public. The server-only model proxy credential must be provisioned securely; it is excluded from source. Schema is recorded separately without learner data.

Production promotion, remaining release/security gates, paid checkout, and full signup/confirmation verification are still pending. Do not treat the prior 50-case Tutor evaluation as rerun on this migrated backend; this preview received the real Tutor smoke test described above.

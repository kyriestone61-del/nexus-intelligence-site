# Relystra implementation checkpoint

Source of truth: the supplied Master Simplification, Delivery System & Surgical Refactor specification, plus the completed current-state audit and user answers. This is an incremental refactor of the existing application.

## Recoverable baseline

- Starting commit: `7cf1b6818585228698cd335fbd9c1e3b6796e2f3` on `main`.
- Implementation branch: `codex/relystra-delivery-refactor`; initially clean full Git clone.
- Repository: `kyriestone61-del/nexus-intelligence-site`.
- Production frontend: Cloudflare Pages project `nexus-intelligence-site`, deployment `040e02f9-09b4-4d71-af34-5e53ce892bac`, check completed September 6, 2026, 18:58:02 UTC.
- Audit verified 94 served assets against Git blob hashes and explained the transformed portal HTML and injected scripts. Cloudflare environment values were not independently available. Deployment requires a fresh parity check.
- Supabase: `dmdgkjksouhhsuojthav`, shared with other applications. Read-only migration recheck returned 290 migrations, latest `20260906184915` / `relystra_task_review_copy`.
- Diagnosis executor: deployed version 13. Model proxy source, billing ownership and credentials remain unverified. Preserve its working interface.
- No production schema, application deployment, client records or storage objects have been changed by this implementation branch.

## Change matrix

| Existing responsibility | Treatment | Canonical destination |
|---|---|---|
| Companies, memberships, authentication | Keep; fix context ownership | Clients and workspace context |
| Diagnosis engine and evidence | Keep; remove pre-purchase project requirement | Diagnosis |
| Actions and task submissions | Refactor existing `nexus_tasks` | Pre-build Actions and internal Build Tasks distinguished explicitly |
| Opportunities and resolution catalog | Refactor existing records | Build Opportunities and Build templates |
| System cards | Keep and extend | Purchased Builds, briefs and delivered systems |
| Projects | Preserve history; enforce paid packages for new flow | Projects / Build Packages |
| Files, activity and templates | Keep but move | Records & Tools |
| Decisions and approvals | Contextualize; preserve histories | Relevant action, build or package |
| Client requests | Keep and extend | Support and escalation |
| Existing stage packages and competing journey overlays | Hide after replacement is wired | One lifecycle owner |
| Dead code and historical records | Remove later only after full acceptance | Retain throughout this initiative |

## Phase B: company context and pre-purchase preparation

Changes are in the existing workspace loader, foundation, operations client-opening handler, diagnosis controller, discovery capture, intake and journey modules. `portal-workspace-context.js` centralizes selection and preparation query rules; it is not a second state store.

The workspace loader resolves company rows, project pointer and associated requirements before committing one state snapshot and URL. Stale requests cannot overwrite the current company. Client-opening navigation waits for the completed load. Company-level discovery context, gaps and diagnosis remain accessible with no project. Existing legacy engagements are retained, including their explicit selection; no historical project is relabeled as paid.

Validation: eight Node regression tests pass, including executing the actual workspace loader against out-of-order responses. Changed JavaScript passes syntax checks; Git whitespace checks pass. This is local contract verification, not authenticated browser acceptance.

The next local checkpoint replaces diagnosis approval with company-level Action suggestions and zero project creation. Deployment and authenticated acceptance remain pending.

## Acceptance and external dependencies

Moon Wax's current company exists with an active owner membership but no current project or diagnosis. The historical orphaned upload prefix and report identifiers are preserved; do not merge or reassign them automatically.

Blue Harbor is user-authorized for disposable QA. The Codex portal browser remains signed out; an authenticated test session is requested. Actual desktop, tablet and mobile client/admin acceptance remains pending.

The user connected the Relystra Stripe account and test mode is available through the connector. Runtime checkout secrets and webhook deployment are not yet configured or verified. Existing Statecraft commerce must not be silently reused as a Relystra payment or treated as evidence of payment. No live charge is authorized by this checkpoint.

The initiative remains **in progress** until the specification's complete Moon Wax acceptance path passes. Local tests, static screenshots or successful build output do not substitute for that result.


## Phase E: pre-build Actions and initial catalogs (local)

- Added two unapplied migrations: `20260907000100_relystra_prebuild_actions.sql` and `20260907000200_relystra_delivery_catalog.sql`.
- Reused `nexus_tasks`, `nexus_action_templates`, `nexus_resolution_catalog`, documents, activity, submissions and review RPCs. No parallel task or approval table was introduced.
- Explicit `work_kind`, responsible party, Action approval state and immutable diagnosis-reference snapshots distinguish new work from legacy records. Restrictive RLS excludes internal Build Tasks and unapproved new Actions from client reads, and routes new writes through validated RPCs.
- Diagnosis approval is idempotent and creates suggestions without a Project. Previously approved diagnoses retain their orchestration history. Only approved Actions become active.
- The existing Actions owner now renders suggested/approved Actions with edit, assignment, approval, rejection, postponement, response review and completed inventory. Client draft saving uses a scoped RPC.
- Existing diagnosis execution gains an administrator-authorized AI preparation operation. It claims the Action, uses the current diagnosis and accepted inputs, performs one bounded model call and submits the result for human review. Its model call has not been exercised live.
- Catalog source: `relystra-delivery-catalog.json`, exactly 25 Action templates and 25 Build templates. The generated migration inserts missing codes only, preserving admin edits and all old templates.
- Local PostgreSQL-compatible tests use PGlite 0.5.8 with audited columns, constraints, RLS policies and the relevant existing submission/owner-boundary functions. They pass approval idempotency, no unpaid Project creation, client/admin ownership, cross-company denial, required responses, stored-file validation, revision and acceptance, retained source evidence and unchanged legacy approvals.
- The fixture excludes external notification/release workers. Passing it does not certify production trigger integration, concurrent connections, the model proxy, Stripe or authenticated browsers.
- Nine targeted tests pass. The wider 85-test contract suite exposed a source-location assertion updated for the shared project selector and an already-failing legacy Phase Zero copy assertion. The latter remains pending retirement of the superseded journey.

References used for implementation: [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [PGlite local PostgreSQL](https://pglite.dev/docs/), [Stripe Checkout Sessions](https://docs.stripe.com/api/checkout/sessions/create).

## Phases F–I: Build planning and payment foundation (local, partial)

- New unapplied migrations: `20260907000300_relystra_build_planning.sql` and `20260907000400_relystra_paid_activation.sql`.
- Build evaluation extends `nexus_opportunities`; purchased Builds extend `nexus_system_cards`; paid packages extend `nexus_projects`. New `nexus_delivery_settings`, `nexus_build_plans` and `nexus_delivery_payment_events` represent configuration, immutable commercial selection and verified provider evidence, which had no existing Relystra authority.
- Build approval requires an approved same-company diagnosis, valid finding snapshot, accepted input references, five scored complexity dimensions, explicit tier, fixed price, duration, scope and acceptance criteria. Client reads receive only the approved projection. Existing member suggestion permissions cannot forge approval or commercial terms.
- Build Plans permit multiple approved Builds, reject missing/circular dependencies, prevent duplicate unpaid reservations, and calculate the greater of dependency-path duration and capacity duration plus QA/client-review allowance. A plan creates zero Projects before verified payment.
- New Edge modules: `_shared/relystra-payments.ts`, `_shared/relystra-stripe.ts`, `relystra-checkout/index.ts`, `relystra-stripe-webhook/index.ts`. Checkout uses saved prices, an idempotent claim, separate account/mode checks and safe cancellation. Only verified settled payments activate the package in an atomic, replay-safe transaction. The diagnosis offer uses the existing `find` entitlement and creates no Project.
- `qa/database/build-planning.test.mjs` and `qa/database/payment-boundary.test.mjs` cover scope isolation, forged approval rejection, dependency totals, cancellation, wrong amount/account/mode/session, signatures, delayed settlement, replay, immutable paid scope, missing-entitlement rollback and diagnosis access. The fixture adds audited entitlement/event/comment metadata; external workers still remain outside the fixture.
- Both new Edge entrypoints pass Deno 2.9.6 type checking against Stripe 22.6.1 / API 2026-08-26.dahlia. Payment configuration and deployment requirements are in `docs/RELYSTRA_PAYMENTS.md`.
- Remaining within these phases: evidence-backed AI Build recommendation generation, Build curation/selection UI, paid diagnosis gating in the diagnosis owner, approved Build briefs and internal task generation. Payment notifications are not wired yet. The older journey still requires replacement before deployment.
- No real payment, deployed checkout, authenticated browser, or Moon Wax lifecycle acceptance has been certified. The initiative remains in progress.

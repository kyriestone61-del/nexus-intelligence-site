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

Blue Harbor is user-authorized for disposable QA. The Codex portal browser is now authenticated as Relystra Admin. Read-only interaction reproduced the live Moon Wax setup CTA routing to the generic Clients list. Actual acceptance of the new branch, including desktop, tablet and mobile client/admin flows, remains pending.

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

## Phase F and G follow-up: evidence-backed recommendations and Build UI component

- `20260907000500_relystra_build_recommendations.sql` adds an atomic, administrator-only proposal batch RPC using the existing review boundary. It rejects changed diagnosis/accepted-input versions and rolls back a batch if any source/template is invalid. Repeated source/template recommendations reuse the original record.
- The existing `nexus-diagnosis-execute/index.ts` gains `recommend_builds` through its existing provider. `_shared/relystra-build-recommendations.ts` validates source paths, template codes and completed Action IDs, rejects duplicates and strips model-supplied final commercial terms. No new AI provider or autonomous approval path is added. A pre-existing PDF union type assertion was corrected without changing extraction behavior.
- `portal-builds.js` provides an explicitly mounted component for existing shell owners: administrator curation, five-factor complexity guidance, fixed pricing, durations, dependencies, client selection, saved plans and checkout/cancellation. `portal-delivery.css` supplies its layout. It is not yet wired into boot/navigation; browser interaction verification remains pending.
- `qa/database/build-recommendations.test.mjs` passes evidence validation, stale-version rejection, batch rollback, replay and client invisibility. All seven local database/payment/recommendation tests pass; the diagnosis executor passes Deno type checking.
- Authenticated production baseline was observed in Codex: Moon Wax's setup CTA opens the generic Clients list, and reopening Moon Wax landed on Client Today with no next actionable item. This is baseline defect evidence, not acceptance of the local fixes.

## Phases I and J: approved Build Briefs, internal work and progress foundation

- Unapplied migration `20260907000600_relystra_paid_build_work.sql` extends existing system cards/opportunities with retained object versions and extends the existing task event capture with reviewed snapshots and file references. No parallel task or approval table is added.
- `relystra_save_brief` derives client, paid package, category, diagnosis sources, purchased scope, supplied inputs, price and duration from retained records. Administrators clarify platforms, roles, automation, integrations, assumptions, risks and test inputs; only approval creates the bounded internal checklist. Repeated approval creates no duplicate tasks.
- `relystra_set_build_task` enforces administrator access, paid package, approved brief, dependencies and stage boundaries. It keeps client task notifications off. `relystra_package_progress` supplies a client-safe projection; internal briefs, checklists and event snapshots stay hidden.
- Progress averages purchased Build progress, including Builds with no approved checklist. Completed technical checklists reach 90%; final QA and delivery still must supply the remaining completion gates. This is a foundation for the next review/delivery phase, not a completed lifecycle.
- `qa/database/paid-build-work.test.mjs` verifies paid/approval prerequisites, immutable paid scope, checklist idempotency, task dependencies, client read/write denial, retained actor/version evidence and progress. It also caught and fixed division-before-multiplication rounding in the progress calculation.
- Review, delivery, support, meaningful package notifications and shell integration remain outstanding. Nothing in this checkpoint has been deployed.

## September 7 integration checkpoint — local implementation, acceptance incomplete

This section supersedes the earlier phase-by-phase outstanding-item lists. The branch now wires the delivery lifecycle into the existing administrator and client shells. It has not been deployed and must not be treated as a finished or paid production implementation.

### Implemented in this checkpoint

- Migrations `20260907000700` and `20260907000800` add versioned draft/final packages, per-Build reviews and scope-controlled revisions, technical/final QA gates, immutable delivery materials, seven-day support, grounded answers and human escalation using the existing Projects, system cards and client requests.
- Migrations `20260907045453`, `20260907045552`, `20260907051007` and `20260907051344` add deduplicated delivery notices, a shared authorized workspace snapshot, new-diagnosis purchase gating with explicit historical access preservation, dependency-cycle guards, validated delivery settings and rejection of new unpaid legacy Projects.
- `portal-admin-journey.js` owns Home, Clients, Projects, Sales, Records & Tools and Settings. It mounts the existing diagnosis/actions and new Build/delivery components contextually. `portal-client-shell-v2.js` presents the seven progressive client sections through the shared lifecycle and keeps package context on mobile.
- `portal-delivery-lifecycle.js`, `portal-diagnosis-offer.js`, `portal-package-delivery.js` and `portal-delivery.css` supply shared state presentation, diagnosis purchase, approved briefs/checklists, progress, review, guides, FAQs and Support. `portal-builds.js` remains the curation and purchase-plan component. Settings now exposes diagnosis price, capacity, QA/review allowance, complexity thresholds and price/duration guidance.
- `portal-app.js` stops mounting competing lifecycle overlays. Diagnosis approval routes to pre-build Actions through the existing approval modules. The existing PDF runtime router remains enabled because it serves document exports, not the retired journey.
- The diagnosis Edge entrypoint adds scoped Support selection and payment access checks. Its shared support helper accepts only exact citations from published materials; unsupported/provider-failed questions create a reviewable request. The existing authenticated email worker closes expired support periods. Internal checklist changes do not email clients; delivery email remains off by default and test/QA events are suppressed.

### Verification and discovered regressions

- All 98 Node contract/database/lifecycle tests passed on the integrated branch. Twenty-three changed/new JavaScript modules passed syntax checks. Four affected Edge entrypoints passed Deno checks earlier in this checkpoint.
- The disposable local PGlite/browser fixture exercised approved brief → nine internal tasks → 90% hold → delivery materials → internal QA → draft → client revision → administrator scope review → revised draft → client approval → final QA → handoff → 100% and Support. All payment and QA evidence in this fixture is explicitly synthetic. The delivered example URL is a fixture, not a built client system.
- The real client shell and runtime were subsequently mounted against the fixture. Package switching retained Final Package, mobile context remained visible, and Help preserved a question into Support. The fixture substitutes empty legacy document/release data and adapts the legacy inbox/context RPCs; this does not certify those production dependencies, authentication, uploads, Stripe, or the external model.
- Browser checks found and fixed lost checklist expansion, missing nested paid scope in briefs, revision forms remaining actionable before triage, new client sections being hidden on refresh, mobile package context being hidden, and Help dropping the question. Additional checks fixed stale navigation writes, inconsistent legacy-project defaults and package-less notification links.
- Security/SQL recheck: production gained migration `20260907023747 add_safe_import_clear_rpc`, belonging to North Star. No development branches exist. Existing security advisors returned 137 baseline items; no new migration has been applied and no post-deployment security certification is claimed.
- Remote main remains baseline `7cf1b6818585228698cd335fbd9c1e3b6796e2f3`. Frontend deployment/asset parity still requires a fresh provider check before production changes.

### Still required for completion

1. Verify Relystra test runtime secrets and signing secret, configure the test webhook, and exercise real hosted Checkout with verified webhook activation. Never use another application's credentials or mark a production plan paid manually.
2. Verify the retained model proxy's implementation/configuration and exercise diagnosis, AI preparation, recommendations and grounded Support through deployed functions.
3. Validate the complete production trigger set and retained portal boot modules, then deploy through a reviewed, recoverable release. Local fixture success alone is insufficient.
4. Complete authenticated administrator/client desktop, tablet and mobile QA, including actual uploads and submissions in the user-authorized Blue Harbor QA company.
5. Run all 59 Moon Wax acceptance steps in the actual application with valid inputs, payment evidence and delivered systems. Historical orphan data remains untouched; no cause or association is inferred. Moon Wax acceptance has not passed.

No production data, schema, Edge deployment, Stripe payment or outbound client message was changed by this checkpoint. The initiative remains in progress.


### CI follow-up after opening draft PR #142

The implementation was committed and pushed to `codex/relystra-delivery-refactor`; draft PR: https://github.com/kyriestone61-del/nexus-intelligence-site/pull/142. Cloudflare built a branch preview. Main remains unchanged and Supabase migrations/functions remain unapplied.

The first CI run exposed obsolete six-stage/three-tab assertions and stale VM test harness imports, plus two real integration gaps: administrator Action processing had depended on the retired UX loader, and retained base forms still used the first project. The boot owner now loads the same governed Action engine explicitly for each role; the base renderer/upload/task/metric/milestone/request paths use the shared active-project selector. Legacy fallback engine polling is disabled in the new lifecycle.

Verification after these fixes: 129 contract/database/lifecycle/regression tests and seven feature test scripts pass (136 total). The locally executable static workflow blocks were checked: 162 blocks, with their four initial failures resolved (three required the local `python3` command and one required updating the actual-renderer VM harness). The strict static audit now has zero P0 findings and six retained P1 compatibility findings. Payment/database tests were added to the existing contract CI workflow using pinned dependencies. All 38 remote checks passed for commit 686c637, including browser CI with 9 passed and 30 authenticated cases skipped. This is not full production acceptance.


### Continued integration verification

- The diagnosis purchase card now displays the immutable saved-plan price rather than a subsequently changed catalog price. Clients can cancel an unpaid diagnosis plan through the existing verified checkout boundary, which expires any issued Stripe session before cancellation. Three additional regression tests cover price retention, cancellation and stale company context; all 132 contract/database/lifecycle tests pass.
- Read-only inspection of the actual Vercel deployment `dpl_48AE7JRbD8FJAk8Wb4rVhNVGhc2S` confirmed the retained proxy source: AI SDK `generateText`, Vercel OIDC, the existing model allowlist, bounded request size and timing-safe verification of a Supabase-backed caller-token hash. The public health endpoint reports OIDC available; SQL checks confirm configuration enabled and hashes match without returning the token. Recent failed diagnosis health records report `MODEL_TIMEOUT`; this does not certify a new paid diagnosis invocation.
- Inspected all 26 live triggers on diagnosis runs, opportunities, Projects, system cards and tasks, and the relevant initialization, release, notification and owner-update function bodies. Paid activation leaves service_slug unset, so historical intake/requirements triggers do not seed unpaid discovery work for the new Build Package. Existing compatibility triggers still need integration verification against the deployed migration set.
- Supabase custom secrets currently include the unrelated Stripe OS key and Resend key, but no dedicated Relystra Stripe runtime secrets. The Relystra test account is accessible and a restricted key form is prepared. Credential creation and transfer to Supabase await the browser-required user confirmation; no key creation or secret storage has been verified.
- The production portal remains on the old six-stage journey. Its authenticated administrator session is available, including the authorized Blue Harbor QA company. No production migration, Edge deployment, payment, or client-data mutation was performed in this follow-up.


### Backend deployment — September 7

The twelve ordered SQL migrations were applied atomically as `relystra_delivery_refactor_v2`. Historical entity counts remained 4 Projects, 31 tasks, 1 diagnosis run and 1 system card. Checkout, manual payments and delivery email remain disabled pending hosted test verification.

The dedicated Relystra restricted test key and webhook signing secret are stored in Supabase, alongside the explicit account and portal origin. Test destination `we_1UCwIhC88swJVkVOE8xABvt5` receives only Checkout completion and asynchronous success with API version `2026-08-26.dahlia`.

Supabase rejected adding a function because the shared project is at its function quota. The existing diagnosis gateway now routes `handler=checkout` to the Auth/RLS-verified checkout handler and `handler=stripe_webhook` to the raw-signature-verified handler. It was deployed as version 18; the email worker's support-expiration addition was deployed as version 14, preserving its existing worker authentication and auth-recovery implementation. Anonymous Checkout returns 401 and an unsigned webhook returns 400. These responses verify the deployed authentication boundary, not paid activation. All 132 local tests and the gateway's Deno type check pass after routing changes. Frontend rollout and hosted payment acceptance are next.

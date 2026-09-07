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

Remaining in this phase: diagnosis approval must stop creating unpaid projects in the database before the complete new diagnosis-to-Actions flow can be deployed. This checkpoint alone does not establish that Moon Wax can complete the lifecycle.

## Acceptance and external dependencies

Moon Wax's current company exists with an active owner membership but no current project or diagnosis. The historical orphaned upload prefix and report identifiers are preserved; do not merge or reassign them automatically.

Blue Harbor is user-authorized for disposable QA. The Codex portal browser remains signed out; an authenticated test session is requested. Actual desktop, tablet and mobile client/admin acceptance remains pending.

Relystra Stripe checkout is not yet configured or verified. Existing Statecraft commerce must not be silently reused as a Relystra payment or treated as evidence of payment. No live charge is authorized by this checkpoint.

The initiative remains **in progress** until the specification's complete Moon Wax acceptance path passes. Local tests, static screenshots or successful build output do not substitute for that result.

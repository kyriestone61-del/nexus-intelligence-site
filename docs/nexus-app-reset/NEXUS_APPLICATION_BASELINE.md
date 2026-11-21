# Nexus Application Baseline

**Directive:** NEXUS-APP-RESET-1.0  
**Phase:** 0 — Freeze and baseline  
**Captured:** 2026-09-03  
**Repository:** `kyriestone61-del/nexus-intelligence-site`  
**Baseline commit:** `747e0fd1d757bbf7ddb0be4b3ce07150b4931658`  
**Audit branch:** `audit/nexus-app-reset-1.0-phase0-1-20260903`  
**Production database project:** Supabase project `dmdgkjksouhhsuojthav`  
**Public production origin:** `nexusintelligence.live`

## 1. Freeze declaration

No application code, production database records, schema objects, authentication settings, storage objects, scheduled jobs, edge functions, or public-site content were modified during this baseline phase.

The only write performed was creation of an isolated GitHub audit branch and documentation on that branch. `main` remains unchanged.

Until the Lead Agent approves the Phase 0–1 checkpoint:

- no new authenticated-portal features should be added;
- no legacy portal module should be deleted;
- no production migration should be applied;
- no Moon Wax record should be manually repaired;
- no existing approval, task, diagnosis, document, or release state should be forced forward;
- no public-site redesign should occur.

## 2. Executive diagnosis

The authenticated Nexus application is not failing because it lacks safeguards or functionality. It is failing because the same business journey is represented by too many overlapping frontend modules, database states, triggers, approval objects, queues, and compatibility layers.

The current system has four simultaneous forms of complexity:

1. **Composition complexity:** a base portal is rendered, then role-specific shells and numerous overlay modules alter it at runtime.
2. **State complexity:** project stage, project status, active engagement, task phase, task status, approval state, approval-chain state, diagnosis state, release state, request state, requirement state, and notification state can all describe the same practical moment.
3. **Automation complexity:** triggers and workers automatically create, synchronize, release, notify, recover, and reconcile related records.
4. **QA complexity:** many tests validate exact filenames, build strings, labels, and module-loading behavior rather than a smaller set of end-to-end business outcomes.

The result is an application that is heavily protected but difficult to reason about. A narrow user action can cross several independently stateful subsystems.

## 3. Source-of-truth and deployment baseline

### 3.1 Repository

- Production branch documented in the repository: `main`.
- Baseline head: `747e0fd1d757bbf7ddb0be4b3ce07150b4931658`.
- Baseline head commit message: `Complete the diagnosis release-to-client handoff`.
- Repository visibility: public.
- Repository size reported by GitHub: approximately 2 MB, excluding Git history.
- Branch inventory: 126 branches were returned. Branch names show repeated generations of portal resets, fixes, hardening, VNext, QA, revenue, diagnosis, mobile, and shell work.

### 3.2 Hosting architecture

The repository documents Cloudflare Pages as the production host with:

- source repository: `nexus-intelligence-site`;
- production branch: `main`;
- no framework build;
- repository root served as static output;
- Supabase retained for authentication, database, private storage, and workers.

`functions/portal.js` intercepts the portal response, rewrites mutable external asset URLs to deployment-local assets, injects selected portal styles/scripts if absent, applies `no-store`, and applies `noindex, nofollow`.

### 3.3 Deployment-SHA confidence

The exact Cloudflare deployment SHA was not available through the connected tools. The production behavior observed in Supabase logs is strongly consistent with the baseline repository code, including the current upload rollback path, but this is not a cryptographic deployment attestation.

**Required before implementation:** obtain or expose the Cloudflare Pages deployment identifier and verify that production is built from the baseline or a known successor commit.

## 4. Authenticated frontend baseline

### 4.1 Static entry shell

`portal.html` still contains the older application frame and legacy navigation surfaces. It includes sections for:

- Today;
- Secure Data Room;
- Action Items;
- Projects;
- Improvements;
- Notifications;
- Activity.

It statically loads core portal styles and then delegates runtime composition to `portal-app.js`.

### 4.2 Runtime composition root

`portal-app.js` is the current composition root.

Common runtime modules include:

- `portal-client.js`;
- `portal-client-plain-language.js`;
- `portal-accessibility.js`.

Client runtime then loads a second shell and service layer including:

- `portal-client-core.js`;
- `portal-client-upload-service.js`;
- `portal-client-shell-v2.js`;
- `portal-client-action-execution.js`;
- `portal-diagnosis-pdf-ui.js`;
- `portal-task-file-attachments.js`;
- `portal-task-file-attachments-live.js`.

Admin runtime loads a much broader overlay set, including foundation hardening, active-engagement cohesion, approval bridge, operations, admin intake, diagnosis controllers and UX modules, diagnosis recovery, diagnosis release, report editing, action workflow/execution, guided operations, admin journey/router, revenue engine, VNext routing/experience, approval inbox, workflow cohesion, BuildingBlok cohesion, and UX refinement.

The admin loader temporarily suppresses `MutationObserver` and selected recurring timers during import. This is a runtime mitigation around module side effects, not a clean ownership model.

### 4.3 Portal-prefixed module footprint

The baseline tree contains at least:

- **56 portal-prefixed JavaScript modules**;
- **29 portal-prefixed CSS modules**;
- additional shared portal dependencies such as `secure-documents.js/css`, `operations.js/css`, `perspective-switcher.css`, and `app.js`.

Not all are loaded for every role, but many represent successive implementations of the same concerns.

### 4.4 Workspace refresh behavior

`portal-client.js` performs a broad workspace refresh that requests projects, tasks, milestones, metrics, documents, notifications, activity, and document requests in parallel, followed by additional requests for project data requirements, notification preferences, and email status.

Production API logs show this refresh pattern repeating within seconds, producing duplicate reads and repeated RPC calls. This is a measurable reliability and performance concern because rendering, route changes, shell reconciliation, or overlay initialization can all trigger another broad refresh.

## 5. Database baseline

The Supabase project is shared with non-Nexus systems. This materially increases migration blast radius.

### 5.1 Nexus object footprint

Catalog inspection found:

- 87 `nexus_*` public tables;
- 3 `nexus_*` public views;
- 97 distinct `nexus_*` public function names;
- 52 distinct `nexus_*` private function names;
- 116 Nexus-related trigger events reported by `information_schema.triggers`;
- 187 Nexus-related RLS policies;
- 66 Nexus tables with estimated live rows;
- approximately 7,693 estimated Nexus rows at capture time;
- 147 non-Nexus public tables in the same Supabase project.

The row estimate is dominated by `nexus_system_health`, which contained approximately 6,088 estimated rows. This reflects scheduled health-write accumulation rather than business volume.

### 5.2 High-coupling tables

The highest-coupling operational tables are:

- `nexus_projects`;
- `nexus_active_engagements`;
- `nexus_tasks`;
- `nexus_documents`;
- `nexus_document_requests`;
- `nexus_project_data_requirements`;
- `nexus_diagnosis_runs`;
- `nexus_diagnosis_report_releases`;
- `nexus_diagnosis_report_client_decisions`;
- `nexus_approvals`;
- `nexus_approval_chains`;
- `nexus_approval_chain_steps`;
- `nexus_notifications`;
- `nexus_activity_log`.

### 5.3 Trigger concentration

The catalog reports especially high trigger counts on:

- `nexus_tasks`: 17 trigger events;
- `nexus_documents`: 10;
- `nexus_document_requests`: 9;
- `nexus_diagnosis_runs`: 8;
- `nexus_approval_chains`: 8;
- `nexus_projects`: 6;
- `nexus_approvals`: 5.

These objects do not merely store state. They normalize, validate, synchronize ownership, create approvals, create releases, notify users, advance stages, and unblock other records. A write to one table can therefore produce multiple downstream transitions.

### 5.4 Approval truth duplication

Approval-related truth currently exists in several forms:

- legacy approvals in `nexus_approvals`;
- generic approval chains;
- approval-chain steps;
- approval events;
- client approval tasks;
- diagnosis report releases;
- diagnosis report client decisions;
- release approval chains;
- task release chains;
- document-request release chains.

These layers may be defensible as internal audit infrastructure, but they should not independently control the user-visible journey.

## 6. Storage and background-worker baseline

### 6.1 Private file storage

The production storage bucket `nexus-client-documents` is private and company-scoped. The current configured maximum is 25 MB with selected business-document and image MIME types.

### 6.2 Scheduled jobs

Observed Nexus cron jobs:

- email worker every 5 minutes;
- launch-health refresh every 5 minutes;
- stale diagnosis recovery every 2 minutes;
- diagnosis execution worker every 2 minutes.

A Statecraft email job also runs in the same database project every minute, reinforcing the shared-project blast-radius concern.

### 6.3 Deployed Nexus edge functions observed

- `nexus-diagnosis-execute`;
- `nexus-email-worker`;
- `nexus-private-file-export`;
- `nexus-calendar-config-check`.

The repository also contains an SMS worker implementation, while production health reports SMS as not configured.

### 6.4 Hidden worker coupling

API logs show the Nexus email worker also touching revenue-agent jobs, SMS queue state, and system-health records. A worker named for email therefore has broader operational responsibilities than its name suggests.

## 7. System-health baseline

Latest recorded health at capture time:

| Check | Status | Baseline observation |
|---|---|---|
| Supabase authentication | Healthy | No recent authentication audit errors reported |
| Diagnosis execution | Healthy | No current failed, blocked, or stale runs |
| Diagnosis provider | Healthy | Moon Wax diagnosis completed with QA score 94 after two attempts |
| Email delivery | Healthy | Queue empty and worker operational |
| Email queue | Healthy | No queued or failed messages |
| Revenue flywheel | Healthy | Worker active with no queued qualifying jobs |
| SMS delivery | Degraded | Twilio configuration absent |
| Diagnosis manual fallback | Degraded historical event | A prior model-proxy timeout used governed fallback |

A green health record does not prove the end-to-end client journey works. Current health checks are mostly subsystem checks and did not prevent the live upload failure documented below.

## 8. Confirmed production incident: Moon Wax upload rollback

At approximately 2026-09-03 20:10 UTC, production logs show this sequence:

1. `Representative_Monthly_Volume_Reports.xlsx` uploaded successfully to the private bucket.
2. The insert into `nexus_documents` failed with HTTP 400.
3. The uploaded storage object was deleted by the rollback path.
4. PostgreSQL recorded: `Document request must belong to the same project`.

The failure is reproducible from current code semantics:

- the selected document request belonged to the older Opportunity Assessment project;
- the active/first project used by the upload service was the financial reconciliation pilot;
- `portal-client-upload-service.js` chooses `project_id` from the attached task or `state.projects[0]`;
- it does not prefer the selected request's project or the selected requirement's project;
- the database lineage trigger correctly rejected the cross-project metadata insert.

This is not a storage-security failure. It is an application-context failure created by multiple concurrently visible project/request/task contexts.

## 9. Moon Wax production-state baseline

### 9.1 Company and user

- Company record: `moon waxing co`.
- One active company owner: Kamari Stone.
- No `nexus_client_intake` row exists.

### 9.2 Projects

Two concurrent projects exist, both marked `planning` and both carrying `engagement_stage = diagnosis`:

1. `Nexus Opportunity Assessment`.
2. `One-period financial reconciliation evidence pilot`.

The active-engagement pointer references the financial reconciliation pilot.

### 9.3 Tasks and requests

Moon Wax currently has:

- 17 tasks across the two projects;
- 16 document requests;
- zero successfully persisted documents;
- one approved diagnosis run;
- zero released diagnosis reports;
- three legacy diagnosis-decision approvals in draft;
- seven approval chains, including cancelled duplicate request-release chains, draft client-decision chains, pending founder release chains, and a pending client-task release chain;
- 46 unread notifications across six notification types.

The client is simultaneously exposed to general preparation, discovery, diagnosis, solution-design, access, permissions, and implementation-plan approval work even though no intake record exists and no document has been accepted.

### 9.4 Internal contradictions

- Two projects are both in diagnosis.
- One project is active, but requests from the other remain actionable.
- Solution-design tasks exist while the active project still reports diagnosis.
- Three different approval concepts exist before a report has been released.
- Duplicate or near-duplicate preparation and workflow-evidence tasks exist across projects.
- Two duplicate `Existing KPI or performance report` requests were created seconds apart and later had their release chains cancelled.
- One diagnosis was approved and orchestrated even though its recorded evidence count was zero.
- The portal generated dozens of unread notifications from one pilot engagement.

This state is the strongest current evidence that the system is expressing internal machinery rather than one authoritative next action.

## 10. Working, broken, intermittent, and manual flows

### Working or materially functional

- public marketing site;
- portal authentication and company membership lookup;
- private bucket upload itself;
- database lineage guards;
- diagnosis worker and stale-run recovery;
- email queue processing;
- diagnosis execution and founder-side approval primitives;
- report PDF infrastructure;
- company-level RLS and admin separation.

### Confirmed broken

- a client upload tied to a request from a non-active project can fail after storage upload and then roll back;
- the client does not have one authoritative project/request/task context;
- current notification volume does not produce a clear next-action experience.

### High-risk or intermittent

- broad workspace refresh can repeat within seconds;
- many admin modules can mutate the same rendered shell;
- diagnosis has previously required stale recovery and manual fallback;
- release/approval/task synchronization is distributed across multiple triggers and modules;
- production deployment SHA is not directly attested.

### Manual interventions that must be eliminated from the accepted golden path

- manual selection of the correct project when the UI surfaces records from multiple projects;
- SQL repair or forced state advancement;
- direct record creation outside the intended UI;
- manual cleanup of duplicate tasks, requests, approvals, or notifications;
- browser developer-tool workarounds;
- hidden founder-only release procedures not surfaced by the admin UI.

## 11. Current QA baseline

The repository contains 43 GitHub Actions workflow YAML files.

The principal QA workflow performs extensive exact-string and exact-module assertions. This provides useful contract coverage but tightly couples tests to the current layered implementation. Many separate workflows guard individual fixes, shell generations, routing layers, approval bridges, diagnosis variants, VNext behavior, mobile behavior, and revenue behavior.

The baseline head had seven workflow runs returned by GitHub for the commit. The displayed pre-marketing run succeeded, and no failure conclusion was found in the returned head-run payload. That does not supersede outcome-based acceptance testing.

## 12. Phase 0 stop conditions currently active

Implementation must not start until the Lead Agent resolves or explicitly accepts these items:

1. verify the exact Cloudflare production deployment SHA;
2. capture a restorable production database/schema backup through the platform's supported backup mechanism;
3. define the authoritative active-engagement rule;
4. define whether an Opportunity Assessment and its implementation pilot are separate engagements or stages of one engagement;
5. decide which approval representation is canonical for the product surface;
6. decide whether legacy approval chains remain backend audit records only;
7. identify every code path that can create tasks, requests, approvals, releases, and notifications;
8. define feature flags before disabling revenue, SMS, VNext, or agent systems;
9. create a disposable Moon Wax QA fixture rather than repeatedly mutating the production client;
10. establish a rollback reference for the first implementation branch.

## 13. Phase 0 conclusion

The baseline confirms the owner's diagnosis.

The public website is not the central problem. The authenticated application is over-composed and over-stateful for the current operating model. Security controls should be retained. The fix is to establish one authoritative engagement context and one product-level task/report/document journey, then adapt the existing backend beneath that interface before retiring legacy objects.
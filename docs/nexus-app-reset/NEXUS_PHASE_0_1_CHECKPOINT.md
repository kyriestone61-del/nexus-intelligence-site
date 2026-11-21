# Lead Agent Checkpoint — Phase 0 and Phase 1

**Directive:** NEXUS-APP-RESET-1.0  
**Owner:** Kyrie Stone  
**Checkpoint date:** 2026-09-03  
**Baseline commit:** `747e0fd1d757bbf7ddb0be4b3ce07150b4931658`  
**Audit branch:** `audit/nexus-app-reset-1.0-phase0-1-20260903`  
**Production changes made:** None

## Decision summary

**Phase 0 status:** Complete, subject to obtaining direct Cloudflare deployment-SHA attestation and platform-supported backup confirmation before implementation.  
**Phase 1 status:** Complete at repository-path, runtime-composition, database-object-group, worker, storage, QA, and production-state levels. Individual function/trigger call edges remain Phase 2 work by design.  
**Go/no-go:** GO for Phase 2 dependency mapping and test-first remediation on an isolated branch. NO-GO for destructive migration, legacy deletion, direct production-state repair, or public-site redesign.

---

## 1. Current system diagnosis

### Primary diagnosis

The authenticated application has become a layered compatibility system rather than one coherent application.

The static portal frame, base client runtime, role-specific shell, role-specific services, and numerous admin/client overlays can all participate in rendering and state reconciliation. Database truth is similarly distributed across projects, active engagement, tasks, document requests, data requirements, diagnosis runs, releases, legacy approvals, approval chains, approval steps, and notifications.

The system is therefore locally sophisticated but globally ambiguous.

### Confirmed failure mechanism

A current Moon Wax upload failed because the selected document request belonged to one project while the upload service derived `project_id` from a task or the first project in the workspace array. The private storage upload succeeded; the metadata insert was rejected by the lineage guard; the storage object was then rolled back.

This incident proves three things:

1. the security/integrity guard is working;
2. the UI/service layer does not own one authoritative engagement context;
3. retries or more overlays will not resolve the architectural cause.

### Current scale mismatch

At baseline, Nexus has:

- 56 portal-prefixed JavaScript modules;
- 29 portal-prefixed CSS modules;
- 43 GitHub Actions workflows;
- 126 Git branches;
- 87 Nexus public tables;
- 3 Nexus views;
- 97 public and 52 private Nexus function names;
- 116 Nexus-related trigger events;
- 187 Nexus-related RLS policies.

Moon Wax, the current pilot, has two concurrent diagnosis-stage projects, 17 tasks, 16 document requests, seven approval chains, three legacy approvals, no accepted documents, no intake row, no released report, and 46 unread notifications.

This is far beyond the product-state surface needed to tell one client what to do next.

### Root cause hierarchy

1. **No single EngagementContext** controls project, task, request, requirement, document, report, and approval selection.
2. **Multiple generations of shell and controller code** remain present and, for admin, frequently runtime-loaded together.
3. **Automatic fan-out** creates tasks, approvals, chains, release gates, requests, and notifications from diagnosis and workflow events.
4. **User-facing state mirrors internal state** rather than projecting a simple business stage and owner.
5. **QA guards implementation details** and therefore stabilizes the layered architecture instead of forcing a simpler outcome.
6. **Advanced systems remain active in the same runtime** even when not required for current client delivery.
7. **The Supabase project is shared** with Statecraft and other systems, making careless migration unacceptable.

---

## 2. Agent assignments and ownership boundaries

No agent may redefine the canonical model independently. The Lead Agent owns architecture and integration.

| Workstream | Assigned agent role | Scope | Prohibited overlap |
|---|---|---|---|
| Program control | Lead Agent / Program Manager | Architecture, sequencing, acceptance, conflicts, release | Does not directly bypass specialist findings |
| Repository forensics | Architecture + Codebase Forensics Agent | Module reachability, imports, event listeners, render ownership, duplicate generations | No database changes |
| State forensics | Database + State-Model Agent | Tables, RPCs, triggers, policies, state transitions, compatibility model | No UI edits; no destructive DDL |
| Client product | Client UX / Product Agent | Home, Tasks, Files, Reports; plain language; mobile | No backend state invention |
| Founder operations | Admin / Operations Agent | Dashboard, Clients, Work, Approvals, Reports; attention queue | No client-shell edits |
| Service consolidation | Backend / Services Agent | Engagement, Task, Document, Diagnosis, Report, Notification services | No direct production deployment |
| Security | Security + Authorization Agent | RLS, role boundaries, file access, deep links, session and API misuse | No weakening controls for convenience |
| Reliability | QA / Reliability Agent | Outcome suites, failure reproduction, golden path, production smoke | No implementation-only acceptance |
| Retirement | Technical Debt / Consolidation Agent | Deprecation register, unreferenced modules, branch/workflow cleanup plan | No deletion before replacement gates |

### Parallelization rules

Safe parallel work in Phase 2:

- frontend dependency mapping;
- database event/trigger graphing;
- security boundary mapping;
- QA inventory and outcome-test design;
- client/admin information architecture design.

Must remain sequential:

1. approve canonical contracts;
2. implement compatibility services;
3. migrate client shell;
4. migrate admin shell;
5. disable advanced systems;
6. retire legacy modules;
7. production cutover.

---

## 3. Top 10 simplification targets

### 1. Establish one authoritative EngagementContext

Every client/admin action must resolve through one explicit engagement/project identifier. No service may infer the active project from array position.

### 2. Repair document lineage at the application boundary

DocumentService must derive project context from the selected task, document request, or data requirement, validate consistency before storage upload, and reject ambiguous context before any bytes are written.

### 3. Replace shell layering with one client shell and one admin shell

The replacement must render directly rather than inject a new shell over legacy sections. Legacy markup should remain only during a bounded compatibility period.

### 4. Project all actionable work through one Task model

Client tasks, founder tasks, Nexus work, document requests, and approval actions may retain specialized backend records, but the UI should consume one normalized task projection.

### 5. Create one Files surface and one DocumentService

Task attachments, general evidence, requested evidence, released files, and reports need explicit categories but one upload/download ownership model.

### 6. Reduce approval to one product-level action

Legacy approvals, chains, steps, release gates, and report decisions should project into one visible approval record with one current actor and one valid next action.

### 7. Define one diagnosis-to-report pathway

Diagnosis execution, founder review, adjustment, release, client review, and client decision should be one linear service contract. Internal execution attempts and evidence provenance remain hidden.

### 8. Replace notification fan-out with an attention projection

The user should see one current action, grouped recent activity, and meaningful alerts. Repeated task/request/approval/workspace events must not create dozens of unread notices.

### 9. Replace broad repeated workspace refreshes with bounded data loading

Create one route-aware query coordinator, deduplicate in-flight requests, cache immutable reference data, and refresh only the affected resource after mutation.

### 10. Consolidate QA around outcomes and disable nonessential runtime systems

Build five authoritative suites. Feature-flag revenue automation, SMS, VNext, perspective switching, and unnecessary agent/workflow surfaces before shell consolidation.

---

## 4. Highest-risk dependencies

### Risk 1 — Shared Supabase project

Nexus coexists with Statecraft and other products. Schema-level mistakes have cross-product blast radius.

**Control:** no destructive migration; explicit object prefixes; platform backup; reversible migration; security regression.

### Risk 2 — Production deployment SHA not directly attested

Repository `main` and production behavior appear aligned, but Cloudflare build metadata was not available.

**Control:** obtain exact Pages deployment ID/SHA before the first implementation release.

### Risk 3 — Trigger-driven state fan-out

Task, document, request, diagnosis, project, approval, and release writes can invoke multiple triggers.

**Control:** event graph first; no trigger disablement until replacement behavior and rollback are proven.

### Risk 4 — Moon Wax has two competing project contexts

The active engagement points to the pilot, while older-project tasks and requests remain actionable.

**Control:** do not manually delete one project; create a canonical engagement projection and an explicit migration plan.

### Risk 5 — Legacy and chain approvals coexist

A legacy approval can be attached to a chain, while report release and client decision create additional approval truth.

**Control:** designate one product projection; retain audit records backend-only during compatibility.

### Risk 6 — Current client shell is injected over legacy markup

The current V2 client shell hides/marks older sections and remounts legacy upload UI.

**Control:** build a clean shell in isolation and route selected clients/QA fixtures through it before removing legacy markup.

### Risk 7 — Worker responsibility is broader than naming suggests

The email worker touches email, revenue-agent jobs, SMS state, and health records.

**Control:** split responsibilities or place each behind explicit worker feature flags.

### Risk 8 — Authentication and file security are working dependencies

A broad rewrite could regress RLS, signed access, redirects, or private storage.

**Control:** preserve existing auth/RLS/storage initially; add security tests before service replacement.

### Risk 9 — Current QA may block simplification for the wrong reasons

Many tests require exact modules, strings, labels, and build IDs.

**Control:** add outcome replacements first; only then retire implementation-coupled assertions.

### Risk 10 — No disposable production-like client fixture exists

Repeated testing against the real Moon Wax record creates state drift and client risk.

**Control:** create a deterministic Moon Wax QA fixture with reset/seed tooling in a non-production environment or isolated tenant.

---

## 5. Proposed canonical architecture

```text
/app
  /core
    bootstrap.js
    auth.js
    session.js
    router.js
    engagement-context.js
    api-client.js
    feature-flags.js
    errors.js
    telemetry.js

  /client
    shell.js
    home.js
    tasks.js
    files.js
    reports.js

  /admin
    shell.js
    dashboard.js
    clients.js
    client-workspace.js
    work.js
    approvals.js
    reports.js

  /services
    authorization-service.js
    engagement-service.js
    task-service.js
    document-service.js
    diagnosis-service.js
    report-service.js
    notification-service.js

  /compat
    project-engagement-adapter.js
    legacy-task-adapter.js
    approval-projection-adapter.js
    document-lineage-adapter.js

  /styles
    base.css
    components.css
    client.css
    admin.css
```

### Ownership rules

- `bootstrap` loads exactly one role shell.
- `router` owns route state; feature modules may request navigation but not rewrite routing independently.
- `engagement-context` owns company and active engagement selection.
- `engagement-service` owns lifecycle stage/status/next-action projection.
- `task-service` owns normalized actionable work.
- `document-service` owns upload/download/context validation.
- `diagnosis-service` owns execution and internal review state.
- `report-service` owns founder review, release, and client-visible report versions.
- `notification-service` owns deduplication and attention summaries.
- compatibility adapters may read legacy structures but may not create a second product model.

### Initial database posture

Do not replace the 87-table schema immediately.

Phase 1 implementation should create a stable projection over existing data:

- Engagement projection from `nexus_projects + nexus_active_engagements`;
- Task projection from tasks, document requests, and necessary approvals;
- Document projection from documents/requests/requirements;
- Report projection from diagnosis releases and client decisions;
- Approval projection from current chain/legacy/release records.

The projection may begin in frontend/service code, then move to read-only views or bounded RPCs after contracts stabilize.

---

## 6. Exact sequencing plan

### Sequence 0 — Preconditions

1. Obtain Cloudflare deployment SHA/ID.
2. Confirm a restorable Supabase backup.
3. Tag the production repository baseline.
4. Create a separate implementation branch from the attested baseline.
5. Preserve the current audit branch as immutable Phase 0–1 evidence.

### Sequence 1 — Phase 2 dependency and event graph

1. Trace every import from `portal.html`, `functions/portal.js`, and `portal-app.js`.
2. Trace dynamic imports initiated by client/admin modules.
3. Map render ownership, MutationObservers, timers, global functions, and event listeners.
4. Map all writes to projects, tasks, documents, requests, requirements, diagnosis, releases, approvals, chains, steps, and notifications.
5. Map triggers/RPCs/workers that fan out from those writes.
6. Produce `NEXUS_DEPENDENCY_GRAPH.md` and `NEXUS_DUPLICATION_MAP.md`.

### Sequence 2 — Contract approval

1. Approve canonical Engagement, Task, Document, Report, User/Role contracts.
2. Approve six-stage lifecycle and five-status model.
3. Approve client/admin navigation.
4. Approve compatibility/deprecation strategy.
5. Approve feature flags and default states.

### Sequence 3 — Test-first context remediation

1. Add a regression fixture for the cross-project upload failure.
2. Add tests proving request/task/requirement project consistency is resolved before storage write.
3. Implement one EngagementContext resolver.
4. Update upload logic to use explicit context.
5. Verify current RLS and lineage triggers still reject malicious mismatches.

### Sequence 4 — Query and runtime consolidation

1. Add request deduplication and bounded route loaders.
2. Remove duplicate refresh triggers from the new path.
3. Add correlation IDs and mutation result states.
4. Keep legacy runtime active only for users not routed to the new shell.

### Sequence 5 — Client shell

1. Build Home, Tasks, Files, Reports against compatibility services.
2. Route QA fixture only.
3. Pass client journey, mobile, refresh/relogin, failure/retry, and security tests.
4. Route Moon Wax test tenant.
5. Do not remove legacy shell yet.

### Sequence 6 — Admin shell

1. Build Dashboard, Clients, Work, Approvals, Reports.
2. Build one client workspace and attention queue.
3. Verify diagnosis, review, release, task creation, and result capture.
4. Pass admin journey and security tests.

### Sequence 7 — Feature isolation

1. Disable revenue automation in the application runtime.
2. Disable VNext and perspective switching.
3. Keep SMS unavailable until configured and justified.
4. Remove BuildingBlok-specific behavior from general core unless used by an active scoped client.
5. Verify public lead capture still works.

### Sequence 8 — QA consolidation

1. Introduce five authoritative suites.
2. Map old tests to retained outcome coverage.
3. Remove only redundant/implementation-coupled tests with documented replacements.
4. Create deterministic Moon Wax fixture reset.
5. Pass five consecutive golden paths.

### Sequence 9 — Production promotion

1. Deploy to staging/preview.
2. Run full desktop/mobile/security/recovery test.
3. Verify Cloudflare/Supabase configuration.
4. Promote with rollback target.
5. Run production smoke.
6. Observe for 48–72 hours.

### Sequence 10 — Retirement

1. Mark superseded modules legacy.
2. Remove runtime references.
3. verify no production calls/listeners.
4. archive modules and workflows.
5. delete only after a stable release cycle.
6. clean stale branches only after protected rollback tags exist.

---

## 7. What must remain untouched during the first implementation wave

- public homepage and public service/marketing pages;
- domain and public routing, except a proven portal-entry defect;
- current Supabase Auth configuration until redirect tests exist;
- existing company membership and platform-admin authorization records;
- private storage bucket and company-scoped RLS;
- current document lineage trigger protections;
- production diagnosis evidence and approved run history;
- founder report-adjustment audit history;
- current email delivery path until replacement is tested;
- existing migration files;
- real Moon Wax records, except normal user actions after a specific approved test plan;
- Statecraft and Human OS objects in the shared Supabase project;
- `main` until a reviewed and tested implementation PR exists.

---

## 8. What can be safely changed first

### Safe documentation and test changes

- dependency graph documentation;
- duplication map;
- state-transition matrix;
- deprecation register;
- outcome test fixtures;
- cross-project upload regression test;
- read-only catalog/diagnostic scripts;
- feature-flag contract tests.

### Safe bounded application changes after tests exist

1. Add a pure `resolveDocumentContext()` function that requires one consistent company/project/task/request/requirement context.
2. Fail before storage upload when context is ambiguous.
3. Stop using `state.projects[0]` as a fallback for request-bound uploads.
4. Deduplicate in-flight workspace refresh calls without changing returned data.
5. Add correlation IDs and explicit `idle/working/success/failed` states to upload.
6. Add disabled-by-default feature flags without deleting advanced code.
7. Add a QA-only shell route or flag for the disposable fixture.

### Not safe yet

- dropping tables;
- disabling triggers;
- changing RLS;
- migrating real client data into new tables;
- deleting legacy approvals/chains;
- removing the old shell from production;
- changing authentication providers/redirects;
- turning off production workers without queue analysis.

---

## 9. Lead Agent decision

The reset should proceed, but it must begin with a narrow reliability correction and compatibility architecture—not a wholesale rewrite.

The first implementation milestone is:

> **One explicit EngagementContext and one context-safe DocumentService, proven by a regression test for the Moon Wax cross-project upload failure.**

The second milestone is:

> **A clean client shell consuming normalized engagement, task, file, and report projections without exposing internal workflow machinery.**

No broader UI replacement or database retirement should begin until those foundations pass.
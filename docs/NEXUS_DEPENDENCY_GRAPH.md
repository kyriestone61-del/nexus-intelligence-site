# Nexus Dependency Graph

**Directive:** NEXUS-APP-RESET-1.0  
**Phase:** 2 — Dependency mapping  
**Baseline:** `747e0fd1d757bbf7ddb0be4b3ce07150b4931658`  
**Implementation branch:** `reset/nexus-phase2-document-context-20260903`

## 1. Executive dependency finding

The authenticated application has one static entry document but several runtime owners. The most important dependency chain is:

```text
Cloudflare /portal request
  -> functions/portal.js
     -> deployment-local HTML/assets
     -> injects shared app.js if absent
     -> injects selected portal CSS if absent
  -> portal.html
     -> portal-security-hardening.js
     -> portal-app.js
        -> portal-runtime-hardening.css
        -> portal-client.js
        -> portal-client-plain-language.js
        -> portal-accessibility.js
        -> role/perspective decision
           -> client runtime OR admin runtime
```

The problem is not the number of files alone. `portal.html`, `portal-client.js`, role shells, services, and multiple overlays all retain authority over rendering, state loading, navigation, or transitions. The app therefore has multiple dependency roots instead of one canonical application root.

## 2. Hosting and entry dependencies

### `functions/portal.js`

Responsibilities currently include:

- fetch the static portal asset;
- rewrite a historical Vercel portal URL to the current origin;
- rewrite mutable jsDelivr `@main` assets to deployment-local assets;
- inject a Main Website link if missing;
- inject secure-document, auth, and operations CSS if missing;
- inject shared `app.js` if missing;
- force `Cache-Control: no-store`;
- force `X-Robots-Tag: noindex, nofollow`.

**Dependency risk:** deployment middleware currently repairs/augments application HTML. The canonical application should eventually own its explicit assets so Cloudflare does not function as a second UI composition layer.

## 3. Static portal frame

`portal.html` contains legacy-visible application anchors for:

```text
Today
Secure Data Room
Action Items
Projects
Improvements
Notifications
Activity
```

It also contains authentication, onboarding, upload, task, milestone, metric, and document-request form anchors.

Static dependencies:

```text
styles.css
portal-ops.css
portal-v2.css
portal-security-hardening.js
portal-app.js
```

The current client shell does not replace this structure at source. It marks/hides legacy sections and creates additional runtime sections.

## 4. Runtime composition root — `portal-app.js`

### 4.1 Common pre-role runtime

```text
portal-app.js
  -> portal-runtime-hardening.css
  -> portal-client.js
  -> portal-client-plain-language.js (optional)
  -> portal-accessibility.js
```

`portal-client.js` is therefore not merely a client feature. It is the shared authenticated data/auth runtime for both roles.

If the signed-in user is a platform administrator:

```text
portal-app.js
  -> perspective-switcher.css
  -> portal-perspective-switcher.js
  -> preparePerspective(portal)
```

Role selection occurs only after perspective preparation.

### 4.2 Client runtime branch

```text
portal-app.js
  -> portal-client-shell-v2.css
  -> portal-client-action-execution.css
  -> portal-client-core.js
  -> portal-client-upload-service.js
       -> portal-task-file-attachments.css
       -> portal-task-file-attachments.js
          -> portal-task-file-attachments-live.js
  -> portal-client-shell-v2.js
  -> portal-client-action-execution.js
  -> portal-diagnosis-pdf-ui.js
```

For an administrator viewing the client perspective, the perspective switcher is mounted again after the client shell initializes.

### 4.3 Admin runtime branch

Admin CSS load set:

```text
portal-layout-fix.css
portal-simplify.css
portal-admin-intake.css
portal-discovery-capture.css
portal-diagnosis-v2.css
portal-action-workflow.css
portal-action-execution-v2.css
portal-guided-ops.css
portal-admin-journey.css
portal-journey-qaqc.css
portal-revenue-engine.css
portal-approval-inbox.css
portal-workflow-cohesion.css
portal-client-guide.css
portal-ux-refinement.css
portal-mobile-hardening.css
portal-buildingblok-cohesion.css
```

Admin JavaScript sequence:

```text
portal-foundation-hardening.js
portal-active-engagement-cohesion.js
portal-approval-bridge.js
portal-ops.js
portal-admin-intake.js
portal-diagnosis-execution-ux.js
portal-diagnosis-v2.js
portal-diagnosis-approval-ux.js
portal-diagnosis-manual-fallback.js (optional)
portal-diagnosis-recovery.js (optional)
portal-action-workflow.js
portal-action-execution-v2.js
portal-action-execution-v2-forms.js (optional)
portal-guided-ops.js (optional)
portal-admin-journey.js
portal-admin-journey-router.js
portal-diagnosis-controller-v2.js
portal-diagnosis-release-queue.js
portal-diagnosis-review-ux.js
portal-diagnosis-report-editor.js
portal-diagnosis-pdf-ui.js
portal-journey-task-guard.js
portal-revenue-engine.js
portal-vnext-runtime-router.js
portal-vnext-experience.js
portal-approval-inbox.js
portal-workflow-cohesion.js
portal-buildingblok-cohesion.js
portal-ux-refinement.js
```

### 4.4 Side-effect suppression during boot

The admin branch temporarily replaces `MutationObserver` with a no-op class while importing `portal-admin-intake.js` and blocks selected recurring intervals while importing workflow code.

This is a critical dependency smell: the composition root must actively suppress behavior of modules during initialization in order to obtain a stable final shell.

## 5. Shared data runtime — `portal-client.js`

### 5.1 Authentication dependencies

```text
Supabase JS client
  -> portal-auth.js
  -> portal-runtime-core.js
  -> nexus_profiles
  -> nexus_is_platform_admin() RPC
  -> nexus_platform_admins compatibility fallback
  -> nexus_company_members
  -> nexus_companies
```

### 5.2 Workspace load fan-out

One canonical `workspace()` call currently fetches in parallel:

```text
nexus_projects
nexus_tasks
nexus_milestones
nexus_metrics
nexus_documents
nexus_notifications
nexus_activity_log
nexus_document_requests
```

It then separately loads:

```text
nexus_project_data_requirements
nexus_data_requirement_catalog
nexus_notification_preferences
/api/email-status
```

Client shell modules then additionally call client-specific RPC/report sources such as:

```text
nexus_get_client_action_context
nexus_get_inbox
nexus_diagnosis_report_releases
nexus_diagnosis_report_client_decisions
```

**Observed production consequence:** broad workspace fetches repeat within seconds during shell initialization and reconciliation. Route/view state and mutation refreshes can therefore duplicate network reads.

## 6. Document upload dependency graph

### Baseline path

```text
Client UI
  -> portal-client-shell-v2.js
     -> portal.prepareUpload({ requestId | taskId | requirementId })
  -> portal-client-upload-service.js
     -> taskFor(taskId)
     -> requestFor(requestId)
     -> requirementFor(requirementId)
     -> projectId = task.project_id OR state.projects[0].id
     -> Supabase Storage upload
     -> INSERT nexus_documents
        -> database lineage/validation triggers
        -> request/requirement synchronization triggers
        -> notifications
     -> portal.workspace() refresh
```

### Confirmed defect

A selected request can belong to Project A while `state.projects[0]` is Project B. Storage writes before the metadata lineage conflict is discovered.

### New canonical boundary in this Phase 2 branch

```text
Client UI
  -> selection identifiers
  -> resolveDocumentContext()
     -> selected task
     -> selected document request
     -> selected data requirement
     -> company validation
     -> single-project validation
     -> explicit projectId or null
  -> only after successful resolution:
     -> storage upload
     -> nexus_documents insert
```

Unbound evidence remains company-level instead of guessing a project.

## 7. Client shell render dependency graph

`portal-client-shell-v2.js`:

```text
legacy portal frame
  -> marks legacy .main sections hidden/legacy
  -> creates runtime client sections
     Today
     Files
     Improvement
     Reports
  -> creates new primary navigation
  -> adds Reports / Help / Inbox topbar controls
  -> reuses/remounts legacy Data Room upload element
  -> consumes portal-client-core projections
  -> consumes state.tasks/docs/milestones/metrics
  -> consumes document requests + report releases + client decisions
```

This is not yet a clean shell because the new UI depends on anchors and surfaces owned by the legacy HTML/runtime.

## 8. Admin shell dependency graph

The current admin shell has no single owner. At a high level:

```text
portal-ops.js
  + portal-admin-intake.js
  + portal-admin-journey.js
  + portal-admin-journey-router.js
  + diagnosis UX/controller modules
  + action workflow/execution modules
  + approval bridge/inbox modules
  + vNext router/experience
  + workflow/buildingblok cohesion modules
  + UX refinement
  + perspective switching
```

Each layer can contribute navigation, rendered content, state labels, route decisions, or reconciliation behavior.

**Canonical target:** one admin router/shell owns `Dashboard | Clients | Work | Approvals | Reports`; specialist services return data and mutations but do not mutate navigation or unrelated DOM.

## 9. Write ownership dependency matrix

| Product concern | Current browser owners | Current DB/RPC owners | Target owner |
|---|---|---|---|
| Engagement | active-engagement cohesion, admin journey/router, diagnosis controller | projects, active_engagements, transition/reconcile functions | EngagementService + EngagementContext |
| Tasks | client action execution, action workflow, action execution v2/forms, task guards | tasks + normalization/notification/release triggers | TaskService |
| Documents | base client runtime, client upload service, task attachment modules | documents + requests + requirements + storage + lineage triggers | DocumentService |
| Diagnosis | admin intake, execution UX, diagnosis v2, controller v2, recovery/fallback | diagnosis_runs + worker + certification + orchestration triggers | DiagnosisService |
| Reports | diagnosis review, report editor, PDF UI, release queue | report releases, adjustments, client decisions | ReportService |
| Approvals | approval bridge, approval inbox, release queue, client approval UI | approvals + chains + steps + report decisions | Approval projection owned by Report/Task services |
| Notifications | base runtime, inbox, client shell | notifications + email outbox + many trigger emitters | NotificationService / Attention projection |
| Navigation | legacy side nav, client shell nav, admin journey router, VNext router, perspective switcher | none | Router |

## 10. Phase 2 dependency conclusions

1. `portal-app.js` is the true runtime composition root but is overloaded with compatibility sequencing.
2. `portal-client.js` is the shared data/auth substrate and must be split by responsibility before shell retirement.
3. The client shell is simpler than the admin shell but still depends on legacy DOM and upload surfaces.
4. The admin shell is materially over-composed and should not receive further overlay modules.
5. The first canonical service boundary is document context because it has a confirmed production failure and can be isolated without database change.
6. Database triggers are currently the strongest integrity boundary; they should remain active during frontend/service consolidation.
7. Future shell work should consume stable service contracts rather than direct broad table reads.

# Nexus Duplication Map

**Directive:** NEXUS-APP-RESET-1.0  
**Phase:** 2 — Duplication mapping  
**Baseline:** `747e0fd1d757bbf7ddb0be4b3ce07150b4931658`

## 1. Purpose

This document identifies where Nexus currently has more than one implementation, representation, or authority for the same product concern.

The goal is not to delete everything immediately. The goal is to identify which behavior must become canonical, which behavior must remain backend-only for compatibility/audit, and which code can later be retired.

## 2. Duplication severity model

| Severity | Meaning |
|---|---|
| Critical | Multiple owners can produce conflicting business state or failed transactions |
| High | Multiple runtime modules control the same user journey or navigation |
| Medium | Duplicate presentation/QA layers increase maintenance cost but are less likely to corrupt state |
| Low | Historical file remains but is not runtime-reachable |

## 3. Shell duplication — HIGH

### Current representations

1. `portal.html` legacy frame
2. base rendering in `portal-client.js`
3. `portal-client-shell-v2.js`
4. prior `portal-client-shell.js`
5. admin composition from `portal-ops.js` + many overlays

### Current failure mode

The current client shell does not own the full DOM. It marks legacy sections as legacy, adds new sections, and remounts the legacy Data Room upload component.

The admin experience is even more layered: no single file owns the final screen.

### Canonical decision

- One direct-render client shell.
- One direct-render admin shell.
- Legacy frame becomes a compatibility entry only during migration.
- No new shell generation file such as `v3`.

## 4. Task/action execution duplication — CRITICAL/HIGH

### Browser implementations

- `portal-client-action-execution.js`
- `portal-action-workflow.js`
- `portal-action-execution-v2.js`
- `portal-action-execution-v2-forms.js`
- `portal-journey-task-guard.js`
- `portal-task-file-attachments.js`
- `portal-task-file-attachments-live.js`

### Database representations

- `nexus_tasks`
- action templates
- action packages/package items
- dependency_task_id
- task release approval chains
- task notifications
- approval actions represented again as tasks

### Canonical decision

`TaskService` owns normalized actionable work. Specialized backend records may project into tasks but may not create separate product-level action systems.

## 5. Document request / evidence duplication — CRITICAL

### Product concepts currently represented by

- `nexus_document_requests`
- `nexus_project_data_requirements`
- upload tasks in `nexus_tasks`
- general Data Room uploads
- task attachments
- diagnosis supporting document arrays
- evidence registry / evidence classifications

### Confirmed duplicate post-insert synchronization

A successful `nexus_documents` insert currently triggers both:

1. `nexus_mark_document_request_received()`
2. `private.nexus_sync_document_request_upload()`

Both update the referenced document request to reflect receipt/fulfillment. The second path also updates `evidence_status`, ownership, and review fields.

The same document insert can also trigger:

- `nexus_mark_requirement_uploaded()`;
- admin notifications;
- additional document-request validation.

### Canonical decision

- `DocumentService` owns user-facing document transactions.
- Document request and requirement records may remain specialized backend entities.
- One backend synchronization path should eventually own request fulfillment.
- Database lineage guard remains authoritative for integrity.

## 6. Project / engagement duplication — CRITICAL

### Current truth sources

- `nexus_projects.status`
- `nexus_projects.engagement_stage`
- `nexus_projects.owner_scope`
- `nexus_active_engagements`
- task phases/statuses
- approval-chain state
- diagnosis state
- report release state
- document request state

### Current observed contradiction

Moon Wax has two projects simultaneously in `diagnosis`, while one active-engagement pointer references the financial reconciliation pilot and requests from the older Opportunity Assessment remain actionable.

### Canonical decision

One `EngagementContext` selects the authoritative engagement/project for a transaction. One `EngagementService` projects stage, status, waiting-on, and next action.

## 7. Diagnosis duplication — HIGH

### Browser modules

- `portal-diagnosis-controller.js`
- `portal-diagnosis-controller-v2.js`
- `portal-diagnosis-v2.js`
- `portal-diagnosis-execution-ux.js`
- `portal-diagnosis-approval-ux.js`
- `portal-diagnosis-review-ux.js`
- `portal-diagnosis-output-hub.js`
- `portal-diagnosis-result-capture.js`
- `portal-diagnosis-state-labels.js`
- `portal-diagnosis-manual-fallback.js`
- `portal-diagnosis-recovery.js`
- `portal-diagnosis-override.js`
- `portal-diagnosis-report-editor.js`
- `portal-diagnosis-release-queue.js`
- `portal-diagnosis-pdf-ui.js`

### Database/runtime concepts

- diagnosis run status
- execution attempts
- worker queue
- certification
- orchestration summary
- diagnosis-generated tasks
- release chain
- report release
- client report decision
- founder adjustment ledger

### Canonical decision

`DiagnosisService` owns internal execution/review. `ReportService` owns the client-visible result lifecycle. Execution status does not directly become client navigation/state.

## 8. Approval duplication — CRITICAL

### Current representations

- `nexus_approvals`
- `nexus_approval_chains`
- `nexus_approval_chain_steps`
- `nexus_approval_events`
- approval tasks in `nexus_tasks`
- task release chains
- document-request release chains
- diagnosis report release chains
- diagnosis report client decisions
- approval bridge and approval inbox UI

### Automatic compatibility behavior

Inserting a legacy approval automatically attaches/creates an approval chain through `private.nexus_attach_legacy_approval_chain()`.

Approved diagnosis runs can also automatically create an internal release chain. Released diagnosis reports can then open a client approval task. The client report decision later updates that task.

This produces several records for one practical decision.

### Canonical decision

The product surface gets one `ApprovalProjection`:

```text
subject
current_actor
state
available_decisions
reason/context
```

Legacy approval/chain records remain backend-only until migration can safely retire them.

## 9. Routing duplication — HIGH

### Current routing/navigation owners

- legacy `.side-nav`
- `portal-client-shell-v2.js` client navigation
- `portal-admin-journey-router.js`
- `portal-vnext-runtime-router.js`
- `portal-perspective-switcher.js`
- diagnosis deep-link modules
- inbox action URLs

### Canonical decision

One router owns route/view state. Perspective switching becomes feature-flagged off during reset. Deep links resolve into canonical shell destinations rather than alternate runtimes.

## 10. Notification duplication/noise — HIGH

### Current emitters include

- task insert/update notifications
- client task update notifications to admins
- newly unblocked task notifications
- document upload notifications
- document request notifications
- approval-step notifications
- diagnosis-ready notifications
- report-release notifications
- workspace notifications
- email outbox fan-out

Moon Wax accumulated 46 unread notifications across a single pilot journey.

### Canonical decision

Retain event/audit data, but expose a deduplicated Attention projection:

```text
Needs your action
Nexus is working
Blocked
Recently completed
Important exception
```

## 11. CSS duplication — MEDIUM/HIGH

### Overlapping style layers

- `portal-v2.css`
- `portal-layout-fix.css`
- `portal-simplify.css`
- `portal-runtime-hardening.css`
- `portal-journey-qaqc.css`
- `portal-mobile-hardening.css`
- `portal-mobile-admin-cleanup.css`
- `portal-ux-refinement.css`
- `portal-workflow-cohesion.css`
- `portal-buildingblok-cohesion.css`
- feature-specific v2/client/admin styles

### Canonical decision

Move valid rules into:

```text
base.css
components.css
client.css
admin.css
```

Then make old overlays unreferenced before archiving.

## 12. Hardening/cohesion duplication — HIGH

### Runtime modules that compensate for architecture rather than own a domain

- `portal-security-hardening.js`
- `portal-foundation-hardening.js`
- `portal-active-engagement-cohesion.js`
- `portal-workflow-cohesion.js`
- `portal-buildingblok-cohesion.js`
- `portal-ux-refinement.js`
- `portal-journey-reliability.js`

### Canonical decision

Keep valid security and integrity behavior, but move it into domain owners. A permanent `cohesion`, `hardening`, or `refinement` layer must not be required for normal runtime correctness.

## 13. Advanced-system duplication/scope expansion — HIGH

### Currently co-resident in the admin runtime

- Revenue Engine
- VNext runtime/experience
- perspective switching
- advanced approval inbox
- BuildingBlok cohesion
- SMS queueing infrastructure
- revenue-agent jobs

These systems are not required to prove Moon Wax client delivery.

### Canonical decision

Feature-flag out of the reset runtime before shell consolidation. Preserve data/code but do not let advanced systems remain mandatory dependencies.

## 14. QA duplication — MEDIUM/HIGH

The repository has dozens of narrow workflows protecting individual fixes and implementation details such as filenames, labels, build identifiers, module load order, and historical shell expectations.

### Canonical decision

Add outcome suites first, then retire overlapping implementation assertions only after equivalent risk coverage exists.

Target authoritative suites:

1. Core
2. Client Journey
3. Admin Journey
4. Security
5. Production Smoke

## 15. Retirement priority

### Wave A — fix ownership without deletion

- canonical document context;
- explicit engagement context;
- query deduplication;
- feature flags.

### Wave B — replace product surfaces

- client shell;
- admin shell;
- task/document/report/approval projections.

### Wave C — make legacy paths unreferenced

- old shells;
- VNext runtime;
- perspective runtime;
- cohesion/refinement overlays;
- redundant action/diagnosis controllers.

### Wave D — archive/delete after stable release

Only after the replacement passes the golden path and production observation window.

## 16. Duplication map conclusion

The highest-risk duplication is not cosmetic. It is duplicated authority over project/engagement context, task state, document fulfillment, diagnosis release, and approval state.

The first implementation change therefore correctly targets context ownership rather than UI redesign: selected task/request/requirement records must determine document lineage before storage is touched.

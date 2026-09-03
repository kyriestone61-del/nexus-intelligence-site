# Nexus Database Event Graph

**Directive:** NEXUS-APP-RESET-1.0  
**Phase:** 2 — Database event graph  
**Production database:** Supabase project `dmdgkjksouhhsuojthav`  
**Inspection mode:** read-only

## 1. Executive finding

Nexus database tables are not passive persistence. Several operational tables act as event hubs with BEFORE/AFTER triggers that validate, normalize, synchronize ownership, create approval chains, create notifications, advance engagement stages, and release downstream work.

This explains why seemingly local frontend changes can produce broad operational side effects.

The reset must preserve these controls initially and progressively reduce duplicated fan-out only after outcome tests exist.

## 2. High-level event graph

```text
PROJECT
  -> intake initialization
  -> requirement seeding
  -> engagement-stage guard
  -> active-engagement reconciliation

DIAGNOSIS RUN
  -> stage becomes diagnosis
  -> quality certification
  -> request-draft seeding/sync
  -> on approved: action-template mapping
  -> on approved: internal report-release chain

TASK
  -> normalize contract/default instructions/owner
  -> maybe create internal client-task release chain
  -> notify client if truly actionable
  -> notify admins
  -> when completed, notify newly unblocked client tasks
  -> refresh project owner

DOCUMENT REQUEST
  -> normalize request/sensitivity
  -> maybe notify client
  -> refresh project owner

DOCUMENT INSERT
  BEFORE:
    -> document lineage validation
    -> task/company validation
    -> document-request upload validation
  AFTER:
    -> mark document request received
    -> sync document request upload
    -> mark project data requirement uploaded
    -> notify admins

APPROVAL
  -> enforce decision boundary
  -> attach legacy approval chain
  -> notify client

APPROVAL CHAIN / STEP
  -> normalize/sync client decision fields
  -> sync owner
  -> refresh project owner
  -> optional ROI status sync

DIAGNOSIS REPORT RELEASE
  -> require approved internal release chain
  -> open client diagnosis approval task

CLIENT REPORT DECISION
  -> synchronize diagnosis approval task to completed or ready-for-review
```

## 3. `nexus_projects` event hub

### Triggered behavior

| Trigger | Timing | Events | Function |
|---|---|---|---|
| `nexus_initialize_intake_project` | AFTER | INSERT, UPDATE | `private.nexus_initialize_intake_project()` |
| `trg_nexus_seed_project_requirements` | AFTER | INSERT, UPDATE | `nexus_seed_project_requirements()` |
| `nexus_projects_guard_engagement_stage` | BEFORE | UPDATE | `private.nexus_guard_engagement_stage_transition()` |
| `nexus_project_terminal_reconcile_active_engagement` | AFTER | UPDATE | `nexus_reconcile_active_engagement_after_project_terminal()` |

### Risk

Project creation/update can create or refresh onboarding/requirement state. Project status/stage is therefore not an isolated field update.

### Reset rule

Do not mutate engagement stage directly from new frontend code. `EngagementService` must use approved transition APIs or a compatibility projection until the state model is formally replaced.

## 4. `nexus_diagnosis_runs` event hub

### Triggered behavior

| Trigger | Timing | Events | Function |
|---|---|---|---|
| `nexus_diagnosis_production_quality_certification` | AFTER | INSERT, UPDATE | `private.nexus_certify_diagnosis_run()` |
| `nexus_diagnosis_runs_advance_stage` | AFTER | INSERT, UPDATE | `private.nexus_advance_stage_from_diagnosis()` |
| `nexus_seed_request_drafts_for_run` | AFTER | INSERT | `private.nexus_seed_request_drafts_for_run()` |
| `nexus_sync_request_drafts_from_analysis` | AFTER | UPDATE | `private.nexus_sync_request_drafts_from_analysis()` |
| `nexus_apply_diagnosis_action_templates` | AFTER | UPDATE | `private.nexus_apply_diagnosis_action_templates_trigger()` |
| `nexus_diagnosis_report_release_chain` | AFTER | UPDATE | `private.nexus_create_internal_release_chain()` |

### Confirmed transitive behavior

`private.nexus_advance_stage_from_diagnosis()` updates the linked project from `discovery` to `diagnosis` for active diagnosis states.

When a diagnosis becomes `approved`, `private.nexus_apply_diagnosis_action_templates_trigger()` invokes `private.nexus_map_diagnosis_action_templates(run_id)`, which maps action templates onto diagnosis-generated tasks and applies dependency relationships between tasks.

An approved diagnosis with analysis output can also invoke `private.nexus_create_internal_release_chain()` to create:

```text
nexus_approval_chains
  + nexus_approval_chain_steps
  + nexus_approval_events
  + approval-step notification
```

for the diagnosis report release.

### Risk

`approved` diagnosis is not simply a status. It can alter project stage, task structure, dependencies, and approval workflow.

### Reset rule

Diagnosis execution/review must remain backend-only. The client product stage should be projected from authoritative state, not derived independently in JavaScript.

## 5. `nexus_tasks` event hub

### Triggered behavior

| Trigger | Timing | Events | Function |
|---|---|---|---|
| `nexus_normalize_task_contract` | BEFORE | INSERT, UPDATE | `private.nexus_normalize_task_contract()` |
| `nexus_tasks_default_instructions` | BEFORE | INSERT, UPDATE | `nexus_default_task_instructions()` |
| `nexus_tasks_sync_owner` | BEFORE | INSERT, UPDATE | `private.nexus_sync_task_owner()` |
| `nexus_enforce_task_update_boundary` | BEFORE | UPDATE | `private.nexus_enforce_task_update_boundary()` |
| `nexus_client_task_notifications` | AFTER | INSERT, UPDATE | `private.nexus_notify_client_on_task()` |
| `nexus_task_notify_admins` | AFTER | INSERT | `private.nexus_notify_admins_on_task()` |
| `nexus_notify_admins_on_client_task_update` | AFTER | UPDATE | `private.nexus_notify_admins_on_client_task_update()` |
| `nexus_release_unblocked_client_tasks` | AFTER | UPDATE | `private.nexus_notify_newly_unblocked_client_tasks()` |
| `nexus_task_release_chain` | AFTER | INSERT, UPDATE | `private.nexus_create_internal_release_chain()` |
| `nexus_tasks_refresh_project_owner` | AFTER | INSERT, UPDATE, DELETE | `private.nexus_refresh_project_owner_from_child()` |

### Client notification filtering

`private.nexus_notify_client_on_task()` only notifies when:

- assignee is `client`;
- `notify_client = true`;
- status is not `draft`;
- `private.nexus_client_action_context_unchecked()` projects the task as `WAITING_ON_YOU`.

### Release-chain fan-out

If a task is client-assigned and in `draft`, `private.nexus_create_internal_release_chain()` can create an internal approval chain before client release.

### Dependency fan-out

When a task transitions into a terminal/completed state, `private.nexus_notify_newly_unblocked_client_tasks()` searches all newly actionable client tasks and can create in-app notifications and email queue entries.

### Risk

A task mutation can affect notifications, email, release approvals, project owner projection, and downstream dependency tasks.

### Reset rule

New `TaskService` operations must be thin calls into existing governed mutations until this fan-out is consolidated. Direct table mutation from multiple UI modules should be eliminated.

## 6. `nexus_document_requests` event hub

### Triggered behavior

| Trigger | Timing | Events | Function |
|---|---|---|---|
| `nexus_normalize_document_request_contract` | BEFORE | INSERT, UPDATE | `private.nexus_normalize_document_request_contract()` |
| `nexus_normalize_document_request_sensitivity` | BEFORE | INSERT, UPDATE | `nexus_normalize_document_request_sensitivity()` |
| `nexus_client_document_request_notifications` | AFTER | INSERT, UPDATE | `private.nexus_notify_client_on_document_request()` |
| `nexus_document_requests_refresh_project_owner` | AFTER | INSERT, UPDATE, DELETE | `private.nexus_refresh_project_owner_from_child()` |

### Risk

Document request state contributes both to user attention and project ownership/waiting-on calculations.

### Reset rule

Document requests remain a backend subtype. Client surface consumes them through `TaskProjection`/`DocumentService`, not as a separate workflow system.

## 7. `nexus_documents` event hub — first implementation target

### BEFORE INSERT/UPDATE validation

| Trigger | Function | Purpose |
|---|---|---|
| `nexus_documents_lineage_guard` | `nexus_validate_document_lineage()` | company/project/request/requirement lineage |
| `nexus_documents_task_company_guard` | `nexus_validate_document_task_company()` | task/company integrity |
| `nexus_validate_document_request_upload` | `private.nexus_validate_document_request_upload()` | request upload contract |

`nexus_validate_document_lineage()` explicitly rejects:

- document project from another company;
- requirement from another company;
- requirement from another project;
- request from another company;
- request from another project.

This is the protection that caught the Moon Wax defect.

### AFTER INSERT fan-out

| Trigger | Function | Effect |
|---|---|---|
| `nexus_document_request_received` | `nexus_mark_document_request_received()` | request → `received`, set fulfilled document |
| `nexus_sync_document_request_upload` | `private.nexus_sync_document_request_upload()` | request → `received`, set fulfilled document, evidence status, owner/review fields |
| `trg_nexus_mark_requirement_uploaded` | `nexus_mark_requirement_uploaded()` | requirement → `uploaded` |
| `nexus_document_notify_admins` | `private.nexus_notify_admins_on_document()` | admin in-app notification + email enqueue |

### Confirmed duplicated write

Two separate AFTER INSERT functions update `nexus_document_requests` for the same document:

```text
nexus_mark_document_request_received()
private.nexus_sync_document_request_upload()
```

The second is a superset of the first for many fields.

### Reset rule

Do not remove either trigger in the first remediation. First fix the client boundary so valid metadata reaches the database. Later, under regression coverage, consolidate request-fulfillment ownership into one function.

## 8. `nexus_approvals` event hub

### Triggered behavior

| Trigger | Timing | Function |
|---|---|---|
| `nexus_enforce_approval_decision_boundary` | BEFORE UPDATE | `private.nexus_enforce_approval_decision_boundary()` |
| `nexus_guard_client_approval_update_trigger` | BEFORE UPDATE | `nexus_guard_client_approval_update()` |
| `nexus_attach_legacy_approval_chain` | AFTER INSERT | `private.nexus_attach_legacy_approval_chain()` |
| `nexus_client_approval_notifications` | AFTER INSERT/UPDATE | `private.nexus_notify_client_on_approval()` |

### Risk

Legacy approval records are automatically bridged into the newer approval-chain model. This means both representations are live dependencies.

### Reset rule

Keep compatibility bridge backend-only until `ApprovalProjection` is authoritative and legacy chain creation can be safely retired.

## 9. `nexus_approval_chains` and steps

### Chain behavior

- BEFORE INSERT/UPDATE: synchronize client-decision fields.
- AFTER INSERT/UPDATE: synchronize project/approval owner.
- AFTER INSERT/UPDATE/DELETE: refresh project owner.
- AFTER UPDATE: optional ROI sync.

### Step behavior

Any INSERT/UPDATE/DELETE can resynchronize approval ownership.

### Risk

Approval state also influences project owner/waiting-on state.

### Reset rule

Admin UI should not infer engagement state independently from raw chain/step rows. Use one approval projection and one engagement projection.

## 10. Diagnosis report release event path

```text
approved diagnosis run
  -> internal release approval chain created
  -> founder approves release chain
  -> nexus_diagnosis_report_releases row becomes released
     BEFORE: guard validates release chain
     AFTER: private.nexus_open_diagnosis_approval_on_report_release()
        -> diagnosis client approval task becomes waiting_on_client
        -> notify_client = true
```

This means a released report can modify an existing client task rather than creating the entire client decision object directly.

## 11. Client diagnosis decision event path

```text
client submits diagnosis report decision
  -> nexus_diagnosis_report_client_decisions INSERT/UPDATE
  -> private.nexus_sync_diagnosis_approval_from_client_decision()
     if approved:
       -> matching diagnosis approval task = completed
     if changes_requested:
       -> matching diagnosis approval task = ready_for_review
```

The task row is therefore a projection/operational representation of a report decision that also exists in a dedicated report-decision table.

## 12. Notification/email event path

Representative paths:

```text
client task released/actionable
  -> nexus_notifications
  -> nexus_email_outbox

client updates task
  -> admin nexus_notifications
  -> admin email enqueue

document uploaded
  -> admin nexus_notifications
  -> admin email enqueue

approval step ready
  -> approval notification
  -> email enqueue
```

This distributed emission model explains notification multiplication.

## 13. First remediation contract

The first test-driven implementation intentionally does **not** change database triggers.

New browser boundary:

```text
resolveDocumentContext({
  companyId,
  taskId,
  requestId,
  requirementId,
  current workspace records
})
```

Rules:

1. selected IDs must exist;
2. selected records must belong to the current company;
3. all project-bound selected records must agree on one project;
4. if one project is resolved, it must exist in the current workspace and belong to the company;
5. no selected project-bound record → company-level document (`project_id = null`);
6. project-array order never chooses lineage;
7. validation happens before storage upload.

The existing database guards remain the second line of defense.

## 14. Event-graph conclusion

The database is currently compensating for a highly distributed frontend by enforcing integrity and synchronizing many related records. Those protections are valuable, but several triggers also duplicate product truth and amplify one mutation into many user-visible records.

The safe simplification order is therefore:

```text
1. establish explicit application context
2. consolidate browser/service ownership
3. add outcome tests
4. project simple client/admin state
5. only then consolidate duplicate triggers/records
```

No production DDL or trigger changes are authorized by this Phase 2 document.

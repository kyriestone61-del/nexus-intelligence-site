# Nexus Application Inventory

**Directive:** NEXUS-APP-RESET-1.0  
**Phase:** 1 — Complete application inventory  
**Captured:** 2026-09-03  
**Baseline commit:** `747e0fd1d757bbf7ddb0be4b3ce07150b4931658`  
**Audit branch:** `audit/nexus-app-reset-1.0-phase0-1-20260903`

## 1. Inventory method and limits

This inventory combines:

- the baseline Git tree;
- the active composition root in `portal-app.js`;
- the static portal entry in `portal.html`;
- Cloudflare Pages routing/function files;
- Supabase production catalog inspection;
- deployed edge-function inspection;
- cron-job inspection;
- production API, edge, and PostgreSQL logs;
- the current Moon Wax database state;
- the current GitHub Actions and branch inventory.

Classification in this document is preliminary until the Phase 2 dependency graph confirms every dynamic import, event listener, database trigger, and RPC call.

### Classification codes

| Code | Meaning |
|---|---|
| KEEP | Required now and should remain authoritative |
| MERGE | Required behavior, but ownership must be consolidated |
| HIDE | Keep backend capability; remove from client conceptual load |
| FLAG | Keep isolated behind an explicit disabled-by-default feature flag |
| ARCHIVE | Preserve in Git history or an archive path after references are removed |
| DELETE | Remove only after replacement validation and rollback readiness |
| REVIEW | Runtime ownership or business need is not yet sufficiently proven |

## 2. Repository-level inventory

### 2.1 Hosting and entry files

| Artifact | Purpose | Surface | Status | Recommendation |
|---|---|---|---|---|
| `index.html` | Public homepage | Public | Current | KEEP; outside reset except entry-link defects |
| `portal.html` | Authenticated application static frame | App | Current but legacy-shaped | MERGE into one canonical shell; retain until replacement passes |
| `operations.html` | Operations/admin page | Admin/public-adjacent | Current | REVIEW relationship to authenticated admin shell |
| `functions/portal.js` | Cloudflare portal response patching and local-asset enforcement | Backend/edge | Current | KEEP initially; reduce injection behavior after canonical shell owns assets |
| `functions/_middleware.js` | Cloudflare middleware | Backend/edge | Current | KEEP pending security review |
| `_headers` | Security/caching headers | Hosting | Current | KEEP |
| `_redirects` | Public route rewrites and booking redirect | Hosting | Current | KEEP; public site outside reset |
| `CLOUDFLARE_MIGRATION.md` | Hosting runbook | Documentation | Current | KEEP and update deployment attestation procedure |
| `app.js` | Shared public/portal-aware behavior | Shared | Current | REVIEW portal-specific side effects |
| `styles.css` | Shared public styles | Shared | Current | KEEP; avoid pulling application overrides into it |
| `simple-site.css` | Public-site styling | Public | Current | KEEP; outside reset |
| `mobile-ux.css` | Public/mobile styling | Shared/public | Current | REVIEW portal reachability |

### 2.2 Public-site files outside the reset boundary

The following are presumed **KEEP / OUT OF SCOPE**, except for defects that prevent authentication or portal entry:

- `about.html`
- `accessibility.html`
- `assessment.html`
- `book.html`
- `booking-manage.html`
- `capabilities.html`
- `case-studies.html`
- `construction.html`
- `delivery-standard.html`
- `faq.html`
- `industries.html`
- `methodology.html`
- `privacy.html`
- `problems.html`
- `prospect-workspace.html`
- `quick-scan.html`
- `roi-calculator.html`
- `security.html`
- `service-detail.html`
- `services.html`
- `terms.html`
- service route directories under `services/`
- founder image assets and public branding assets.

## 3. Portal JavaScript inventory

The baseline contains 56 portal-prefixed JavaScript files.

### 3.1 Current composition and bootstrap

| Artifact | Observed role | Runtime status | Recommendation |
|---|---|---|---|
| `portal-app.js` | Role-aware module loader and boot coordinator | Authoritative composition root | KEEP temporarily; replace with smaller canonical bootstrap |
| `portal-client.js` | Base auth, company context, broad workspace fetch, legacy rendering/events | Always loaded | MERGE into `core/auth`, `core/session`, and canonical data services |
| `portal-client-core.js` | Client runtime helpers/contracts | Client-loaded | MERGE into canonical client core |
| `portal-runtime-core.js` | Runtime helpers for admin modules | Admin-loaded | MERGE with one shared runtime boundary |
| `portal-auth.js` | Authentication behavior | Injected/legacy support | KEEP behavior; MERGE ownership into one auth service |
| `portal-security-hardening.js` | Browser-side security/hardening hooks | Static portal load | REVIEW each control; integrate valid controls into owners, retire overlay |
| `portal-foundation-hardening.js` | Admin foundation guards | Admin-loaded | MERGE valid behavior; ARCHIVE overlay after replacement |
| `portal-accessibility.js` | Portal accessibility remediation | Always loaded | KEEP behavior; integrate into canonical components |

### 3.2 Client shell and client experience

| Artifact | Observed role | Runtime status | Recommendation |
|---|---|---|---|
| `portal-client-shell-v2.js` | Injects client shell, hides/marks legacy shell, mounts legacy upload surface | Client-loaded | Replace with the single canonical client shell; do not create v3 |
| `portal-client-shell.js` | Prior client shell generation | Not loaded by current composition root | ARCHIVE after dependency confirmation |
| `portal-client-guide.js` | Guided client experience | Not directly loaded by baseline composition root | REVIEW; likely MERGE/HIDE |
| `portal-client-plain-language.js` | Client copy transformation | Always loaded | KEEP copy principles; move text into owning components |
| `portal-client-action-execution.js` | Client action/task execution | Client-loaded | MERGE into canonical TaskService and one task renderer |
| `portal-client-diagnosis-flow.js` | Client diagnosis journey | Not directly loaded by composition root | REVIEW; merge required behavior into Reports/Tasks |
| `portal-client-diagnosis-deeplink.js` | Diagnosis deep-link routing | Not directly loaded by composition root | MERGE into canonical router |
| `portal-client-upload-service.js` | Client upload transaction and rollback | Client-loaded | KEEP concept; fix project-context ownership in canonical DocumentService |
| `portal-task-file-attachments.js` | Task-bound file controls | Dynamically imported by upload service | MERGE into task/document components |
| `portal-task-file-attachments-live.js` | Live task attachment enhancement | Dynamically imported | MERGE; remove enhancement layering |
| `portal-simplify.js` | Portal simplification overlay | Not current composition-root load | ARCHIVE behavior after canonical shell makes it unnecessary |

### 3.3 Admin shell, navigation, and operations

| Artifact | Observed role | Runtime status | Recommendation |
|---|---|---|---|
| `portal-ops.js` | Core admin operations/workspace behavior | Admin-loaded | MERGE into canonical admin services/views |
| `portal-admin-intake.js` | Admin intake management | Admin-loaded | MERGE into Clients/Work |
| `portal-admin-journey.js` | Admin journey UI/state | Admin-loaded | MERGE into canonical admin router/workspace |
| `portal-admin-journey-router.js` | Admin route redirection | Admin-loaded | MERGE into one router |
| `portal-guided-ops.js` | Guided operations overlay | Admin-loaded | HIDE/ARCHIVE after admin attention queue is canonical |
| `portal-perspective-switcher.js` | Perspective switching | Admin-loaded | FLAG off, then ARCHIVE unless a current need is proven |
| `portal-active-engagement-cohesion.js` | Reconciles active engagement in UI | Admin-loaded | MERGE into EngagementService; eliminate UI reconciliation ownership |
| `portal-buildingblok-cohesion.js` | BuildingBlok-specific cohesion | Admin-loaded | FLAG/REVIEW; remove from general core if not required for active client |
| `portal-workflow-cohesion.js` | Cross-module workflow reconciliation | Admin-loaded | MERGE backend truth; ARCHIVE UI overlay |
| `portal-ux-refinement.js` | Runtime UI refinements | Admin-loaded | Integrate valid changes into components; ARCHIVE overlay |
| `portal-launch-control.js` | Launch readiness/controls | Not directly loaded by baseline composition root | HIDE in admin diagnostics or archive |

### 3.4 Diagnosis modules

| Artifact | Observed role | Runtime status | Recommendation |
|---|---|---|---|
| `portal-diagnosis-controller.js` | Prior diagnosis controller | Admin-loaded before v2 | MERGE/retire after v2 behavior mapping |
| `portal-diagnosis-controller-v2.js` | Later diagnosis controller | Admin-loaded | Select one canonical DiagnosisService; no additional generation |
| `portal-diagnosis-v2.js` | Diagnosis V2 experience | Admin-loaded | MERGE into canonical diagnosis view |
| `portal-diagnosis-review-ux.js` | Review UI overlay | Admin-loaded | MERGE into Reports/Approvals |
| `portal-diagnosis-execution-ux.js` | Execution-state UX | Admin-loaded | HIDE internal stages; retain progress/error states only |
| `portal-diagnosis-output-hub.js` | Diagnosis outputs | Admin-loaded | MERGE into canonical Reports view |
| `portal-diagnosis-result-capture.js` | Captures diagnosis results | Admin-loaded | MERGE into DiagnosisService/ReportService |
| `portal-diagnosis-state-labels.js` | Maps internal state labels | Admin-loaded | DELETE after client/admin use canonical product states |
| `portal-diagnosis-manual-fallback.js` | Governed manual fallback | Admin-loaded | KEEP backend capability; HIDE behind admin recovery action |
| `portal-diagnosis-recovery.js` | Recovery UI/path | Admin-loaded | KEEP recovery capability; MERGE into one bounded recovery route |
| `portal-diagnosis-override.js` | Diagnosis override behavior | Admin-loaded | KEEP only audited founder adjustment behavior; HIDE raw overrides |
| `portal-diagnosis-report-editor.js` | Founder report editing | Admin-loaded | KEEP controlled editing; MERGE into Reports |
| `portal-diagnosis-release-queue.js` | Release queue | Admin-loaded | MERGE into canonical Approvals queue |
| `portal-diagnosis-approval-ux.js` | Approval UI | Admin-loaded | MERGE into one approval surface |
| `portal-diagnosis-pdf-ui.js` | PDF download UI | Client- and admin-relevant | KEEP behavior; integrate into Reports |

### 3.5 Approval and action execution

| Artifact | Observed role | Runtime status | Recommendation |
|---|---|---|---|
| `portal-approval-bridge.js` | Bridges legacy and chain approval models | Admin-loaded | HIDE as compatibility adapter; retire after canonical approval migration |
| `portal-approval-inbox.js` | Approval inbox | Admin-loaded | MERGE into `Approvals` |
| `portal-action-workflow.js` | Action workflow state | Admin-loaded | MERGE into TaskService |
| `portal-action-execution-v2.js` | Later action execution | Admin-loaded | Consolidate with task execution; no v3 |
| `portal-action-execution-v2-forms.js` | Forms for V2 execution | Referenced by execution layer | MERGE into canonical task form components |
| `portal-journey-task-guard.js` | Journey/task gating | Admin-loaded | Move validation to canonical state/service boundary |
| `portal-journey-reliability.js` | Journey reliability overlay | Not directly loaded by current composition root | REVIEW; merge valid safeguards, archive overlay |

### 3.6 Advanced/future systems

| Artifact | Observed role | Runtime status | Recommendation |
|---|---|---|---|
| `portal-revenue-engine.js` | Revenue flywheel/admin capability | Admin-loaded | FLAG off for reset; preserve data/code |
| `portal-vnext-runtime-router.js` | Experimental VNext routing | Admin-loaded | FLAG off |
| `portal-vnext-experience.js` | Experimental VNext experience | Admin-loaded | FLAG off |
| `portal-discovery-capture.js` | Discovery capture | Admin-loaded | MERGE into Discovery stage and Document/Task services |

### 3.7 Complete portal-prefixed JavaScript path list

`portal-accessibility.js`, `portal-action-execution-v2-forms.js`, `portal-action-execution-v2.js`, `portal-action-workflow.js`, `portal-active-engagement-cohesion.js`, `portal-admin-intake.js`, `portal-admin-journey-router.js`, `portal-admin-journey.js`, `portal-app.js`, `portal-approval-bridge.js`, `portal-approval-inbox.js`, `portal-auth.js`, `portal-buildingblok-cohesion.js`, `portal-client-action-execution.js`, `portal-client-core.js`, `portal-client-diagnosis-deeplink.js`, `portal-client-diagnosis-flow.js`, `portal-client-guide.js`, `portal-client-plain-language.js`, `portal-client-shell-v2.js`, `portal-client-shell.js`, `portal-client-upload-service.js`, `portal-client.js`, `portal-diagnosis-approval-ux.js`, `portal-diagnosis-controller-v2.js`, `portal-diagnosis-controller.js`, `portal-diagnosis-execution-ux.js`, `portal-diagnosis-manual-fallback.js`, `portal-diagnosis-output-hub.js`, `portal-diagnosis-override.js`, `portal-diagnosis-pdf-ui.js`, `portal-diagnosis-recovery.js`, `portal-diagnosis-release-queue.js`, `portal-diagnosis-report-editor.js`, `portal-diagnosis-result-capture.js`, `portal-diagnosis-review-ux.js`, `portal-diagnosis-state-labels.js`, `portal-diagnosis-v2.js`, `portal-discovery-capture.js`, `portal-foundation-hardening.js`, `portal-guided-ops.js`, `portal-journey-reliability.js`, `portal-journey-task-guard.js`, `portal-launch-control.js`, `portal-ops.js`, `portal-perspective-switcher.js`, `portal-revenue-engine.js`, `portal-runtime-core.js`, `portal-security-hardening.js`, `portal-simplify.js`, `portal-task-file-attachments-live.js`, `portal-task-file-attachments.js`, `portal-ux-refinement.js`, `portal-vnext-experience.js`, `portal-vnext-runtime-router.js`, `portal-workflow-cohesion.js`.

## 4. Portal CSS inventory

The baseline contains 29 portal-prefixed CSS files.

### 4.1 Current or runtime-reachable styles

- `portal-auth.css` — KEEP behavior; consolidate into base/auth component styles.
- `portal-ops.css` — MERGE into admin styles.
- `portal-v2.css` — MERGE and retire version naming.
- `portal-runtime-hardening.css` — integrate valid rules; ARCHIVE overlay.
- `portal-client-shell-v2.css` — replace with canonical client stylesheet.
- `portal-client-action-execution.css` — merge into Tasks.
- `portal-task-file-attachments.css` — merge into Tasks/Files.
- `portal-admin-intake.css` — merge into Admin Clients.
- `portal-admin-journey.css` — merge into Admin shell.
- `portal-diagnosis-v2.css` — merge into Reports/Diagnosis.
- `portal-diagnosis-output-hub.css` — merge into Reports.
- `portal-approval-inbox.css` — merge into Approvals.
- `portal-action-workflow.css` — merge into Work/Tasks.
- `portal-action-execution-v2.css` — merge into Work/Tasks.
- `portal-guided-ops.css` — archive after guided overlay removal.
- `portal-revenue-engine.css` — FLAG off with revenue engine.
- `portal-vnext-experience.css` — FLAG off.
- `portal-workflow-cohesion.css` — archive after component ownership.
- `portal-buildingblok-cohesion.css` — FLAG/REVIEW.
- `portal-ux-refinement.css` — integrate valid rules, then archive.

### 4.2 Legacy/repair-oriented style candidates

- `portal-client-shell.css`
- `portal-client-guide.css`
- `portal-simplify.css`
- `portal-diagnosis-result-capture.css`
- `portal-discovery-capture.css`
- `portal-journey-qaqc.css`
- `portal-layout-fix.css`
- `portal-mobile-admin-cleanup.css`
- `portal-mobile-hardening.css`

These should not remain permanent layered styles. Valid declarations must be moved into the canonical component stylesheet, after which the overlay files should become unreferenced and archived.

### 4.3 Complete portal-prefixed CSS path list

`portal-action-execution-v2.css`, `portal-action-workflow.css`, `portal-admin-intake.css`, `portal-admin-journey.css`, `portal-approval-inbox.css`, `portal-auth.css`, `portal-buildingblok-cohesion.css`, `portal-client-action-execution.css`, `portal-client-guide.css`, `portal-client-shell-v2.css`, `portal-client-shell.css`, `portal-diagnosis-output-hub.css`, `portal-diagnosis-result-capture.css`, `portal-diagnosis-v2.css`, `portal-discovery-capture.css`, `portal-guided-ops.css`, `portal-journey-qaqc.css`, `portal-layout-fix.css`, `portal-mobile-admin-cleanup.css`, `portal-mobile-hardening.css`, `portal-ops.css`, `portal-revenue-engine.css`, `portal-runtime-hardening.css`, `portal-simplify.css`, `portal-task-file-attachments.css`, `portal-ux-refinement.css`, `portal-v2.css`, `portal-vnext-experience.css`, `portal-workflow-cohesion.css`.

## 5. Other authenticated-application source files

| Artifact | Purpose | Recommendation |
|---|---|---|
| `secure-documents.js` | Secure document UI and access behavior | MERGE into DocumentService/client Files/admin Reports |
| `secure-documents.css` | Secure document styles | MERGE |
| `operations.js` | Operations console behavior | REVIEW overlap with `portal-ops.js` |
| `operations.css` | Operations styling | REVIEW/MERGE |
| `operations-perspective-switcher.js` | Perspective switching outside portal prefix | FLAG/ARCHIVE |
| `operations-ux-refinement.js` | Operations UI overlay | MERGE/ARCHIVE |
| `perspective-switcher.css` | Perspective switcher styling | FLAG/ARCHIVE |
| `snapshot-lifecycle-patch.js` | Snapshot lifecycle repair layer | REVIEW; eliminate patch pattern |
| `launch-readiness.js` | Readiness instrumentation | HIDE in admin diagnostics |
| `phase-two.js`, `phase-three.js`, `phase-five.js` | Historical phased behavior | REVIEW; likely ARCHIVE after reachability check |
| `service-route.js` | Public service routing | KEEP; public site |
| `diagnostic-ui.css` | Public diagnostic styling | KEEP; public site unless portal-reachable |
| `experience-round-two.css` | Later public/client experience styling | REVIEW scope and ownership |

## 6. Cloudflare Pages Functions inventory

### Core edge/runtime

- `functions/_middleware.js` — KEEP pending security review.
- `functions/portal.js` — KEEP initially; reduce HTML mutation after canonical shell.
- `functions/assessment.js` — public diagnostic; KEEP outside reset.
- `functions/robots.txt.js` — public hosting; KEEP.
- `functions/sitemap.xml.js` — public hosting; KEEP.

### API functions

- `functions/api/booking-availability.js` — public booking; KEEP outside reset.
- `functions/api/booking-create.js` — public booking; KEEP outside reset.
- `functions/api/booking-manage.js` — public booking; KEEP outside reset.
- `functions/api/diagnosis-report-pdf.js` — report delivery; KEEP and consolidate ownership with ReportService.
- `functions/api/discovery-request.js` — lead/discovery request; KEEP outside authenticated reset unless handoff defects exist.
- `functions/api/email-dispatch.js` — notification dispatch; REVIEW against Supabase email worker to avoid duplicate ownership.
- `functions/api/email-status.js` — email status; HIDE from normal client workspace.
- `functions/api/opportunity-snapshot.js` — public lead capture; KEEP outside reset.
- `functions/_lib/google-calendar.js` — booking support; KEEP outside reset.

## 7. Supabase edge-function inventory

Observed deployed Nexus functions:

| Function | Observed state | Recommendation |
|---|---|---|
| `nexus-diagnosis-execute` | Active | KEEP; canonical diagnosis worker |
| `nexus-email-worker` | Active | KEEP email delivery; split or disable unrelated revenue/SMS responsibilities |
| `nexus-private-file-export` | Active | KEEP; security review and Report/Document ownership |
| `nexus-calendar-config-check` | Active | KEEP outside portal reset |

Repository-present function:

- `supabase/functions/nexus-sms-worker/index.ts` — FLAG off while Twilio is unconfigured.

Shared-project warning: numerous Statecraft and Human OS functions are deployed in the same Supabase project. Nexus migrations and function changes must be explicitly scoped and rollback-safe.

## 8. Supabase migration inventory

The repository contains successive Nexus migrations covering revenue, approvals, workspaces, diagnosis, client shell state, evidence lineage, intake, routing, task attachments, and guardrails.

### 2026-08-31 generation

- `20260831_000_nexus_revenue_approval_actor.sql`
- `20260831_001_nexus_global_admin_notifications.sql`
- `20260831_nexus_active_engagement_terminal_guard.sql`
- `20260831_nexus_approval_chain_enforcement.sql`
- `20260831_nexus_approval_chains_inbox.sql`
- `20260831_nexus_company_memory_raw_privacy.sql`
- `20260831_nexus_diagnosis_contract_hardening.sql`
- `20260831_nexus_diagnosis_qa_idempotency.sql`
- `20260831_nexus_diagnosis_release_qa_inbox.sql`
- `20260831_nexus_release_rpc_privilege_lockdown.sql`
- `20260831_nexus_revenue_flywheel_01_schema.sql`
- `20260831_nexus_revenue_flywheel_02_logic.sql`
- `20260831_nexus_revenue_flywheel_03_agents.sql`
- `20260831_nexus_revenue_flywheel_04_release_controls.sql`
- `20260831_nexus_revenue_flywheel_05_ops_handoffs.sql`
- `20260831_nexus_revenue_flywheel_06_targeting_economics.sql`
- `20260831_nexus_revenue_flywheel_07_suppression_sync.sql`
- `20260831_nexus_revenue_flywheel_08_cascade_delete_guard.sql`
- `20260831_nexus_workspace_foundation_hardening.sql`
- `20260831_z_nexus_approval_chain_enforcement.sql`
- `20260831_zz_nexus_approval_chain_visibility.sql`
- `20260831_zzz_nexus_inbox_ordering_fix.sql`

### 2026-09-01 generation

- `20260901_nexus_admin_client_preview_inbox.sql`
- `20260901_nexus_atomic_client_workspace_activation.sql`
- `20260901_nexus_client_shell_action_state.sql`
- `20260901_nexus_diagnosis_approval_qualitative_baseline_fix.sql`
- `20260901_nexus_diagnosis_step4_activation_and_inbox_routing.sql`
- `20260901_nexus_evidence_lineage_and_action_instructions.sql`
- `20260901_nexus_revenue_first_touch_approval_deadlock_fix.sql`
- `20260901_nexus_revenue_followup_due_gate.sql`
- `20260901_nexus_snapshot_founder_decision_domain_fix.sql`

### 2026-09-02 and 2026-09-03 generation

- `20260902_nexus_public_snapshot_gateway.sql`
- `20260902_nexus_step2_discovery_diagnosis_redesign.sql`
- `20260903191000_nexus_diagnosis_client_flow_guardrails.sql`
- `20260903_nexus_step2_advisor_hardening.sql`
- `20260903_nexus_step2_template_mapper_fix.sql`
- `20260903_nexus_task_document_attachments.sql`
- `20260903_nexus_task_document_company_guard.sql`

Recommendation for all existing migrations: **KEEP as immutable history**. Do not edit prior migration files. Future compatibility/deprecation work must use new, explicitly reversible migrations.

## 9. Database table inventory

Catalog inspection found 87 Nexus tables. They are grouped below by current product need.

### 9.1 Canonical identity, tenant, engagement, and access — KEEP/MERGE

- `nexus_companies`
- `nexus_company_members`
- `nexus_profiles`
- `nexus_platform_admins`
- `nexus_platform_members`
- `nexus_projects`
- `nexus_active_engagements`
- `nexus_client_intake`
- `nexus_role_permission_defaults`
- `nexus_company_permission_overrides`
- `nexus_platform_permission_overrides`

Target: preserve security and membership; adapt `projects + active_engagements` into one canonical EngagementService surface.

### 9.2 Canonical work, document, report, and communication records — KEEP/MERGE

- `nexus_tasks`
- `nexus_task_comments`
- `nexus_documents`
- `nexus_document_requests`
- `nexus_project_data_requirements`
- `nexus_notifications`
- `nexus_notification_preferences`
- `nexus_activity_log`
- `nexus_milestones`
- `nexus_metrics`
- `nexus_kpi_definitions`
- `nexus_incidents`
- `nexus_client_requests`

Target: one TaskService, one DocumentService, one NotificationService, one Results/Report surface.

### 9.3 Diagnosis and evidence — KEEP/HIDE/MERGE

- `nexus_diagnosis_runs`
- `nexus_diagnosis_request_drafts`
- `nexus_diagnosis_report_releases`
- `nexus_diagnosis_report_client_decisions`
- `nexus_diagnosis_report_questions`
- `nexus_diagnosis_report_adjustments`
- `nexus_discovery_context_entries`
- `nexus_discovery_framework_requirements`
- `nexus_discovery_gap_analyses`
- `nexus_data_requirement_catalog`
- `nexus_evidence_registry`
- `nexus_canon_records`
- `nexus_company_memory`
- `nexus_memory_records`

Target: retain sophisticated provenance and evidence internally; expose only Discovery, Diagnosis, Report, and the next required action.

### 9.4 Approval systems — MERGE/HIDE/DEPRECATE

- `nexus_approvals`
- `nexus_approval_chains`
- `nexus_approval_chain_steps`
- `nexus_approval_events`
- `nexus_founder_decision_queue`
- `nexus_decision_register`

Target: one product-level approval surface. Legacy approval objects may remain compatibility/audit records but must not independently drive visible client state.

### 9.5 Action/template/package systems — KEEP/HIDE/MERGE

- `nexus_action_templates`
- `nexus_action_packages`
- `nexus_action_package_items`
- `nexus_artifact_templates`
- `nexus_blueprint_layers`
- `nexus_blueprint_actions`

Target: backend templates may generate canonical tasks; clients should not see package/template machinery.

### 9.6 Operations, automation, and registry systems — FLAG/HIDE

- `nexus_automation_candidates`
- `nexus_automations`
- `nexus_experiments`
- `nexus_operating_reviews`
- `nexus_improvement_ledger`
- `nexus_system_cards`
- `nexus_system_registry`
- `nexus_tool_registry`
- `nexus_workflow_definitions`
- `nexus_workflow_runs`
- `nexus_workflow_exceptions`
- `nexus_connector_health`
- `nexus_agent_registry`
- `nexus_agent_evaluations`

Target: disable advanced execution surfaces during reset; retain backend data behind explicit flags.

### 9.7 Revenue and commercial systems — FLAG

- `nexus_revenue_leads`
- `nexus_revenue_agent_jobs`
- `nexus_flywheel_execution_log`
- `nexus_flywheel_requirement_checks`
- `nexus_lead_exceptions`
- `nexus_lead_research_evidence`
- `nexus_outreach_packets`
- `nexus_outreach_sequence_steps`
- `nexus_commercial_offerings`
- `nexus_company_entitlements`
- `nexus_solution_purchase_requests`
- `nexus_roi_estimates`
- `nexus_opportunities`
- `nexus_opportunity_snapshot_leads`
- `nexus_case_studies`
- `nexus_discovery_requests`

Target: public lead capture may remain. Autonomous revenue orchestration and portal exposure should be disabled during the application reset.

### 9.8 Worker, queue, health, and telemetry systems — KEEP/HIDE/REDUCE

- `nexus_email_outbox`
- `nexus_sms_outbox`
- `nexus_worker_config`
- `nexus_system_health`
- `nexus_analytics_events`
- `nexus_model_proxy_config`
- `nexus_model_proxy_public_hash`

Target: retain operational reliability, but split worker ownership, reduce health-write accumulation, and keep telemetry out of the normal client experience.

## 10. Database views inventory

- `nexus_diagnosis_quality_dashboard_v` — KEEP/HIDE in admin diagnostics.
- `nexus_revenue_flywheel_health_v` — FLAG with revenue flywheel.
- `nexus_revenue_lead_fit_v` — FLAG with revenue flywheel.

## 11. Database function inventory by responsibility

### 11.1 Access and authorization — KEEP

Public functions include:

- `nexus_is_platform_admin`
- `nexus_is_company_member`
- `nexus_is_company_creator`
- `nexus_company_role`
- `nexus_platform_role`
- `nexus_company_has_permission`
- `nexus_platform_has_permission`
- `nexus_get_my_access`
- `nexus_can_access_company_folder`
- `nexus_can_access_storage_object`
- `nexus_can_view_document`
- `nexus_list_company_members`
- `nexus_list_platform_members`

These remain authoritative security controls subject to the security review.

### 11.2 Engagement, onboarding, and state — MERGE

- `nexus_activate_client_workspace`
- `nexus_onboard_company_atomic`
- `nexus_set_active_engagement`
- `nexus_reconcile_active_engagement_after_project_terminal`
- `nexus_transition_engagement_stage`
- `nexus_seed_project_requirements`
- private `nexus_initialize_intake_project`
- private `nexus_guard_engagement_stage_transition`
- private `nexus_advance_stage_from_diagnosis`
- private `nexus_refresh_project_owner`
- private `nexus_refresh_project_owner_from_child`

Target: one EngagementService and one state-transition matrix.

### 11.3 Tasks and actions — MERGE

- `nexus_admin_set_task_status`
- `nexus_approve_task`
- `nexus_assign_action_package`
- `nexus_assign_action_template`
- `nexus_default_task_instructions`
- `nexus_release_client_task`
- `nexus_reopen_nexus_task`
- `nexus_request_task_revision`
- `nexus_submit_task_for_review`
- private normalization, ownership, release, notification, and guard functions for tasks.

Target: one TaskService contract with actor, precondition, transition, failure, and next action.

### 11.4 Documents and requests — KEEP/MERGE

- `nexus_mark_document_request_received`
- `nexus_mark_requirement_uploaded`
- `nexus_normalize_document_request_sensitivity`
- `nexus_release_document_request`
- `nexus_validate_document_lineage`
- `nexus_validate_document_task_company`
- private `nexus_normalize_document_request_contract`
- private `nexus_sync_document_request_upload`
- private `nexus_validate_document_request_upload`
- private document-owner and notification functions.

Target: one DocumentService must resolve project context from the selected task/request/requirement rather than a UI array position.

### 11.5 Diagnosis, report, and release — KEEP/MERGE/HIDE

- `nexus_admin_apply_manual_diagnosis`
- `nexus_approve_diagnosis`
- `nexus_archive_diagnosis`
- `nexus_block_diagnosis`
- `nexus_request_diagnosis_revision`
- `nexus_preview_diagnosis_client_report`
- `nexus_release_diagnosis_report`
- `nexus_revoke_diagnosis_report`
- `nexus_add_diagnosis_report_adjustment`
- `nexus_revoke_diagnosis_report_adjustment`
- `nexus_effective_client_report`
- `nexus_client_report_projection`
- `nexus_client_report_display_shape`
- `nexus_submit_diagnosis_report_decision`
- `nexus_submit_diagnosis_question`
- `nexus_answer_diagnosis_question`
- `nexus_send_diagnosis_request_draft`
- `nexus_send_discovery_information_request`
- `nexus_save_discovery_admin_context`
- private certification, scoring, orchestration, recovery, request-draft, report-matching, and approval-sync functions.

Target: retain evidence and governance internally, but define one diagnosis path and one report release path.

### 11.6 Approval functions — MERGE/HIDE

- `nexus_create_approval_chain`
- `nexus_start_approval_chain`
- `nexus_decide_approval_step`
- `nexus_cancel_approval_chain`
- `nexus_resubmit_approval_chain`
- `nexus_release_approval`
- `nexus_request_entity_approval`
- private functions for chain creation, completion, enforcement, owner sync, notifications, and user eligibility.

Target: use as a backend engine only where needed. Product surface should expose one approval object/action.

### 11.7 Notification functions — KEEP/MERGE

- `nexus_claim_email_batch`
- `nexus_queue_action_digests`
- private `nexus_enqueue_external_email`
- private `nexus_enqueue_member_email`
- private client/admin notification functions.

Target: one NotificationService; deduplicate event emission and collapse 46 unread Moon Wax notices into actionable summaries.

### 11.8 Revenue/commercial functions — FLAG

All `nexus_admin_*outreach*`, revenue lead scoring, suppression, revenue agent claims, solution purchase, entitlement, ROI, and snapshot-to-revenue functions should remain available only behind the revenue feature boundary during the reset.

## 12. Trigger inventory and classification

The database reports 116 trigger events associated with Nexus. Multiple events can correspond to one trigger because `information_schema.triggers` emits a row per event type.

Highest-density tables:

| Table | Reported trigger events | Preliminary recommendation |
|---|---:|---|
| `nexus_tasks` | 17 | Consolidate normalization, ownership, release, notification, and project-owner effects |
| `nexus_documents` | 10 | Preserve validation; consolidate request/requirement synchronization and notifications |
| `nexus_document_requests` | 9 | Consolidate normalization, release, owner refresh, and notification effects |
| `nexus_diagnosis_runs` | 8 | Preserve certification/recovery; remove automatic user-surface fan-out |
| `nexus_approval_chains` | 8 | Backend-only engine; one product approval projection |
| `nexus_projects` | 6 | One state transition owner |
| `nexus_approvals` | 5 | Compatibility layer pending deprecation |
| `nexus_outreach_packets` | 5 | FLAG with revenue engine |
| `nexus_diagnosis_report_releases` | 4 | One release pathway |
| `nexus_document_requests` / `nexus_documents` | high combined | Immediate reliability priority |

All trigger names and function bodies require Phase 2 dependency mapping before any disablement.

## 13. RLS policy inventory

The database reports 187 Nexus-related policies across public tables and `storage.objects`.

The policy model generally separates:

- authenticated company-member reads;
- owner/admin updates;
- platform-admin management;
- public insert/read only where intentionally required;
- private document access through company membership or platform administration.

Preliminary recommendation: **KEEP all policies during shell/service consolidation.** Policy reduction is not a Phase 1 goal. Any future policy change requires the Security Agent's explicit test matrix.

## 14. Storage inventory

| Bucket | Public | Limit | Types | Recommendation |
|---|---:|---:|---|---|
| `nexus-client-documents` | No | 25 MB/file | PDF, DOCX, XLSX, CSV, text, PNG, JPEG | KEEP; repair context selection above storage layer |

Storage object policies include company-scoped upload/download and Nexus-admin update/delete controls.

## 15. Cron and worker inventory

| Job | Schedule | Recommendation |
|---|---|---|
| Nexus email worker | Every 5 minutes | KEEP email delivery; split unrelated responsibilities |
| Nexus launch health | Every 5 minutes | KEEP but reduce write amplification/retention |
| Nexus diagnosis stale recovery | Every 2 minutes | KEEP |
| Nexus diagnosis worker | Every 2 minutes | KEEP |
| Statecraft email delivery | Every minute in same project | Outside Nexus; protect from Nexus migrations |

## 16. QA and test inventory

### 16.1 GitHub Actions

The repository contains 43 workflow files:

1. `action-items-qa.yml`
2. `admin-journey-qa.yml`
3. `approval-inbox-qa.yml`
4. `client-action-inline-files-qaqc.yml`
5. `client-diagnosis-flow-qaqc.yml`
6. `client-direct-workflow-handoff-qa.yml`
7. `client-journey-e2e-qa.yml`
8. `client-plain-language-qaqc.yml`
9. `client-shell-refactor-qaqc.yml`
10. `client-simple-guide-qa.yml`
11. `control-room-browser-qa.yml`
12. `control-room-reconciliation.yml`
13. `core-admin-nav-qa.yml`
14. `diagnosis-approval-qa.yml`
15. `diagnosis-pdf-ui-qaqc.yml`
16. `diagnosis-recovery-qa.yml`
17. `diagnosis-report-editor-qaqc.yml`
18. `inbox-diagnosis-mobile-qa.yml`
19. `journey-runtime-routing-qa.yml`
20. `mobile-perspectives-qaqc.yml`
21. `nexus-diagnosis-step4-qaqc.yml`
22. `nexus-ux-refinement-qaqc.yml`
23. `ops-guided-qa.yml`
24. `parallel-a11y-remediation-qaqc.yml`
25. `parallel-browser-e2e.yml`
26. `parallel-contracts-qaqc.yml`
27. `parallel-resilience-qaqc.yml`
28. `parallel-runtime-contract-qaqc.yml`
29. `parallel-security-qaqc.yml`
30. `parallel-state-transition-qaqc.yml`
31. `parallel-ux-qaqc.yml`
32. `perspective-switcher-qaqc.yml`
33. `portal-access-safety-gate.yml`
34. `portal-boot-final-layout-qa.yml`
35. `portal-shell-reset-qa.yml`
36. `pre-marketing-qaqc.yml`
37. `production-runtime-smoke.yml`
38. `qa.yml`
39. `revenue-flywheel-qa.yml`
40. `service-detail-qa.yml`
41. `vnext-diagnosis-experience-qa.yml`
42. `vnext-free-runtime-qa.yml`
43. `workflow-cohesion-qa.yml`

Recommendation: preserve until replacement suites prove equivalent outcomes. Then consolidate into Core, Client Journey, Admin Journey, Security, and Production Smoke.

### 16.2 Contract tests

`qa/contracts/` contains contract suites for bootstrap, module loading, journey state, state transitions, workspace state, visibility, diagnosis refresh, VNext, onboarding, revenue, discovery capture, and other subsystem contracts.

Preliminary classification:

- security/state invariants: KEEP/MERGE;
- exact module-loader and build-string assertions: replace with outcome tests;
- revenue and VNext contracts: FLAG with their systems;
- duplicate journey/state tests: consolidate.

### 16.3 Browser tests

`qa/playwright/tests/` contains:

- control-room reconciliation;
- mobile smoke;
- public smoke;
- role-boundary;
- sitewide public mobile.

These are useful foundations. The missing authoritative suite is a disposable-client, full-lifecycle Moon Wax golden path with repeatable reset/seed behavior.

### 16.4 Additional tests

Top-level `tests/` contains focused QA/QC for:

- client action inline files;
- client diagnosis flow;
- direct workflow handoff;
- plain-language client experience;
- client shell refactor;
- diagnosis PDF UI;
- diagnosis report editor.

These should be mapped into the five authoritative suites, not immediately deleted.

## 17. Documentation inventory relevant to the reset

- `docs/AI_NATIVE_OPERATING_SYSTEM.md` — future architecture; FLAG/HIDE during reset.
- `docs/founder-diagnosis-report-editor.md` — KEEP.
- `docs/highlighted-nexus-qaqc-status-20260903.md` — KEEP as prior status evidence.
- `docs/nexus-client-mobile-e2e-matrix.md` — KEEP/MERGE into QA matrix.
- revenue flywheel operating plan, RACI, coverage, release checklist, and risk register — FLAG with revenue system.
- `docs/nexus-vnext-release-contract.md` — FLAG with VNext.
- `qa/RESET_ACCEPTANCE_MATRIX.md` — REVIEW and reconcile with this directive.
- `qa/A11Y_REMEDIATION_PLAN.md` — KEEP/merge into client/admin component acceptance.

## 18. Branch inventory signal

GitHub returned 126 branches. Names include repeated sequences such as:

- `portal-hard-reset-shell`, `...-final`, `...-v2`, `...-v3`, `...-v4`;
- multiple client shell, diagnosis, release, mobile, revenue, VNext, QA, hardening, and reconciliation branches;
- parallel QA branches for accessibility, backend, contracts, E2E, resilience, runtime, security, transitions, and UX.

Branches are not runtime code, but the pattern confirms repeated additive repair cycles. Branch cleanup should occur only after the reset establishes protected release references.

## 19. Immediate classification summary

### Required now

- auth and authorization;
- company membership;
- active engagement;
- client/admin shells;
- tasks;
- documents;
- diagnosis;
- founder review;
- report release;
- client decision;
- notifications;
- audit logs;
- error/recovery;
- core QA and security tests.

### Backend-only

- evidence lineage;
- provenance;
- internal diagnosis execution state;
- trigger orchestration;
- queue state;
- health telemetry;
- approval-chain internals;
- template/package generation.

### Future/flagged

- revenue flywheel;
- autonomous agent jobs;
- SMS;
- VNext experience;
- perspective switching;
- BuildingBlok-specific general-core behavior;
- advanced workflow registry/execution surfaces;
- commercial entitlements and standalone purchases until terms are authoritative.

### Deprecated candidates

- prior client shell;
- duplicate diagnosis controller generation;
- simplification, hardening, cohesion, refinement, layout-fix, and mobile-fix overlays after their valid behavior is integrated;
- legacy navigation sections hidden by the client V2 shell;
- legacy approvals as a product surface;
- implementation-coupled workflow tests after outcome replacements exist.

## 20. Phase 1 conclusion

The inventory confirms that Nexus has the necessary capabilities but lacks one authoritative owner per concern.

The next phase must build a dependency and event graph before edits begin. The first implementation should not be a visual redesign. It should establish an authoritative EngagementContext and repair task/request/requirement/document project resolution through one service boundary. The shell simplification should then consume that canonical context.
# Nexus Reset Acceptance Matrix

This matrix is the independent acceptance standard for the active Nexus reset. It is intentionally stricter than visual QA. A reset is not complete merely because the portal renders cleanly.

## Severity model

- **P0**: release blocker. Can corrupt journey state, expose client/internal data, create ambiguous engagement state, or make critical workflows silently fail.
- **P1**: must resolve before pre-market execution is considered complete.
- **P2**: hardening/quality improvement that may follow immediately after stabilization if no client or security risk exists.

## 1. Runtime / boot ownership

| ID | Priority | Acceptance requirement |
|---|---|---|
| RUNTIME-01 | P0 | Exactly one module owns role-specific portal initialization. |
| RUNTIME-02 | P0 | Admin never sees client navigation or an intermediate navigation state. |
| RUNTIME-03 | P0 | Required modules are distinguished from optional modules; a required module failure produces a visible recoverable error and does not reveal a partially functional workspace. |
| RUNTIME-04 | P1 | Reset removes permanent dependence on temporary setInterval/MutationObserver suppression used to control legacy race conditions. |
| RUNTIME-05 | P1 | Company switches cancel/ignore stale async responses from the previously selected company. |
| RUNTIME-06 | P1 | A failed data query is represented as a load error, not silently converted to an empty list. |

## 2. Identity, authentication, and recovery

| ID | Priority | Acceptance requirement |
|---|---|---|
| AUTH-01 | P0 | Admin and client roles resolve server-side from authoritative membership/permission records. |
| AUTH-02 | P0 | Client cannot elevate role or access admin-only diagnosis/internal tools through UI manipulation. |
| AUTH-03 | P1 | Forgot Password flow exists and returns the user safely to Nexus. |
| AUTH-04 | P1 | Email verification flow handles success, expired link, reused link, and authenticated return without looping. |
| AUTH-05 | P1 | Session expiration produces a clear sign-in recovery path without destroying unsaved form state where practical. |
| AUTH-06 | P1 | Sign-out clears the active workspace and sensitive in-memory state. |

## 3. Company / tenant isolation

| ID | Priority | Acceptance requirement |
|---|---|---|
| TENANT-01 | P0 | Client can read only companies for which the authenticated user has an active membership. |
| TENANT-02 | P0 | Every project/task/milestone/metric/request/approval/document/diagnosis is company-bound and cannot reference a project owned by another company. |
| TENANT-03 | P0 | Client UI does not query or render platform-wide/global Nexus records. |
| TENANT-04 | P0 | Company Memory has an explicit client-safe projection; internal operating context and internal decision notes are not exposed by default. |
| TENANT-05 | P0 | Decision/evidence records honor client_visible before rendering to clients. |
| TENANT-06 | P1 | Automated/browser QA verifies a QA client identity cannot enumerate another company's name or records. |

## 4. Canonical engagement identity

| ID | Priority | Acceptance requirement |
|---|---|---|
| ENG-01 | P0 | Active engagement/project is explicit. Runtime must not infer it from `projects[0]` or array order. |
| ENG-02 | P0 | If more than one active project exists and no active engagement is selected, Nexus blocks stage operations and asks for a deterministic selection/resolution. |
| ENG-03 | P1 | Discovery project, diagnosis pilot, implementation project, and managed-operations project can coexist without misrouting tasks/evidence/metrics. |
| ENG-04 | P1 | Project type/service role is populated for all active engagement projects. |

## 5. Client onboarding atomicity

| ID | Priority | Acceptance requirement |
|---|---|---|
| ONBOARD-01 | P0 | Company + membership + initial engagement creation is one transactional/idempotent server operation. |
| ONBOARD-02 | P0 | A retry cannot create duplicate companies, memberships, initial projects, or action packages. |
| ONBOARD-03 | P1 | Partial provider/network failure has a safe retry path. |
| ONBOARD-04 | P1 | Client cannot create an arbitrary privileged service/project through the onboarding path. |

## 6. Canonical state vocabulary

| ID | Priority | Acceptance requirement |
|---|---|---|
| STATE-01 | P0 | Persisted task statuses use one canonical vocabulary. Legacy aliases are normalized only at boundaries. |
| STATE-02 | P0 | Persisted diagnosis statuses use one canonical vocabulary. |
| STATE-03 | P0 | Stage completion cannot be inferred merely from existence of a row. |
| STATE-04 | P0 | Failed, blocked, or revision-requested diagnosis never marks the diagnosis gate complete. |
| STATE-05 | P1 | Every consequential state transition is validated server-side. |
| STATE-06 | P1 | UI labels may be friendly, but they map deterministically to canonical persisted states. |

## 7. Client Journey behavior

| ID | Priority | Acceptance requirement |
|---|---|---|
| JOURNEY-01 | P0 | Current stage is determined from required evidence + decisions + deliverables + approvals, not task count alone. |
| JOURNEY-02 | P0 | Prior incomplete gate locks consequential actions in later stages. |
| JOURNEY-03 | P0 | Every client workspace surfaces one primary Next Best Action and explains why it is next. |
| JOURNEY-04 | P0 | Waiting on Client / Waiting on Nexus / Waiting on Decision / Blocked are distinguishable. |
| JOURNEY-05 | P1 | Stage/gate changes have an audit trail with source evidence and actor. |
| JOURNEY-06 | P1 | Company/engagement switch recomputes journey from authoritative state and never displays stale prior-client status. |

## 8. Evidence / secure data room

| ID | Priority | Acceptance requirement |
|---|---|---|
| EVIDENCE-01 | P0 | Upload metadata is company/engagement bound and RLS-protected. |
| EVIDENCE-02 | P0 | A file does not satisfy an evidence requirement solely because its filename exists. |
| EVIDENCE-03 | P1 | Explicit request → uploaded evidence → request fulfillment is traceable. |
| EVIDENCE-04 | P1 | Missing/unavailable/not-applicable evidence can be represented without faking completion. |
| EVIDENCE-05 | P1 | Confidential evidence has a defined client/admin visibility boundary. |
| EVIDENCE-06 | P1 | Evidence request reminders are idempotent and rate controlled. |

## 9. Diagnosis

| ID | Priority | Acceptance requirement |
|---|---|---|
| DIAG-01 | P0 | Same transcript cannot create multiple unresolved diagnosis runs accidentally. |
| DIAG-02 | P0 | Diagnosis reads only authorized evidence for the active company/engagement. |
| DIAG-03 | P0 | Provider failure preserves the diagnosis packet and exposes a recovery path. |
| DIAG-04 | P0 | Approval is explicitly human-controlled and idempotent. |
| DIAG-05 | P0 | Approved diagnosis creates only company-consistent downstream records. |
| DIAG-06 | P1 | Diagnosis lifecycle updates through one canonical state refresh path; avoid reload/timer/observer race choreography. |
| DIAG-07 | P1 | Score/status/document-request vocabulary is normalized at trusted boundaries. |

## 10. Tasks / approvals / decisions

| ID | Priority | Acceptance requirement |
|---|---|---|
| TASK-01 | P0 | Client can only act on tasks assigned to the client and belonging to the client's company. |
| TASK-02 | P0 | Consequential task transitions use constrained state-transition operations rather than arbitrary row edits. |
| TASK-03 | P0 | Dependencies block completion when required. |
| TASK-04 | P1 | Ready for Review → Approve / Request Revision is deterministic and auditable. |
| TASK-05 | P1 | `not_applicable` requires an explicit reason/evidence when it bypasses a normal requirement. |

## 11. Measurements / proof

| ID | Priority | Acceptance requirement |
|---|---|---|
| VALUE-01 | P0 | Engagement cannot be described as measured/complete merely because a metric record exists. |
| VALUE-02 | P1 | Baseline, current value, measurement method, window, evidence, confidence, and limitations are representable. |
| VALUE-03 | P1 | Client-visible proof distinguishes measured result from estimate or inferred attribution. |

## 12. Accessibility / mobile

| ID | Priority | Acceptance requirement |
|---|---|---|
| A11Y-01 | P1 | Every input/select/textarea has an explicit accessible name. |
| A11Y-02 | P1 | Modal dialogs have dialog semantics, focus management, Escape/Close behavior, and return focus. |
| A11Y-03 | P1 | Dynamic success/error/status updates are announced appropriately. |
| A11Y-04 | P1 | All primary flows are keyboard operable. |
| MOBILE-01 | P1 | 390px and 430px layouts have no horizontal overflow. |
| MOBILE-02 | P1 | Admin journey, diagnosis review, evidence upload, client task submission, and approvals are usable on phone. |
| MOBILE-03 | P1 | Touch targets are appropriately sized and fixed/sticky controls do not cover required actions. |

## 13. Failure / recovery behavior

| ID | Priority | Acceptance requirement |
|---|---|---|
| FAIL-01 | P0 | Network/API failure cannot silently look like an empty successful workspace. |
| FAIL-02 | P0 | Critical-module failure blocks the relevant workspace with a recovery message. |
| FAIL-03 | P1 | Double-click/retry cannot duplicate action packages, diagnosis runs, document requests, proposals, or emails. |
| FAIL-04 | P1 | Refresh/reopen returns the user to a coherent authoritative state. |
| FAIL-05 | P1 | Provider outage, auth expiry, and stale data have explicit recovery messages. |

## 14. Behavioral E2E acceptance

The reset must ultimately pass browser automation for at least:

1. anonymous portal/auth load;
2. admin login and stable admin navigation;
3. client login and admin-feature isolation;
4. QA client tenant isolation;
5. multi-project active-engagement selection;
6. evidence upload/request fulfillment using a disposable QA tenant;
7. diagnosis success path;
8. diagnosis provider-failure recovery;
9. client task submission → admin review;
10. password recovery;
11. mobile admin/client smoke flows;
12. no unexpected console/page errors during the tested path.

## 15. Post-reset extension readiness

Before implementing Client Journey Stage-Gate, Meeting-to-Execution, Intelligent Evidence Requests, and Diagnosis-to-Proposal, the reset must expose clean boundaries for:

- explicit company + engagement context;
- server-authoritative journey/gate state;
- evidence registry and request fulfillment;
- diagnosis review/approval events;
- decision register;
- tasks/approvals/milestones/metrics;
- client-visible vs internal projections;
- idempotent event handlers;
- audit log/event correlation identifiers.

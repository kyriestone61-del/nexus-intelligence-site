# Nexus Canonical Task + Attention Projection

**Directive:** NEXUS-APP-RESET-1.0  
**Status:** Core projection implemented and QA-validated; consumer integration pending  
**Production impact:** None

## 1. Why this layer exists

Nexus currently stores several legitimate operational record types:

- `nexus_tasks`;
- `nexus_document_requests`;
- legacy approvals;
- approval chains and steps;
- diagnosis releases and client decisions;
- notifications and activity.

Those records serve persistence, authorization, audit, and workflow automation. They should not all become separate user-facing concepts.

The Task projection is the product boundary between backend machinery and the simple question:

> What needs action now, what is Nexus doing, and what happens next?

## 2. Inputs

The initial client-oriented projection accepts:

- canonical `EngagementContext`;
- raw task rows;
- the governed client-action context from `nexus_get_client_action_context`;
- document requests.

The existing database RPC remains the authoritative dependency-state evaluator for client tasks. The projection does not recreate hidden dependency truth in the browser.

## 3. Active-engagement boundary

When an active project exists, the projection contains only records owned by that project.

It does not surface backlog from a different open project simply because that record is still present in the database.

This directly addresses the Moon Wax condition where the active financial-reconciliation pilot coexists with an older Opportunity Assessment backlog.

If `EngagementContext` is ambiguous, the projection emits no project-scoped actions. Nexus must resolve the engagement first rather than guessing.

If no active project exists, only explicitly company-level records are eligible.

## 4. Canonical product task shape

Each projected item contains:

```text
id
sourceType
sourceId
companyId
projectId
owner
  client | nexus

title
description
actionType

state
  todo
  in_progress
  waiting
  complete

attention
  waiting_on_you
  nexus_working
  upcoming
  blocked
  complete

requiresAction
priority
phase
dueDate
blockedBy
source
```

`source` retains the raw row for compatibility/debugging; the shell should not require knowledge of the raw table to render the product task.

## 5. Client task normalization

The governed `canonical_state` from `nexus_get_client_action_context` maps as follows:

| Governed state | Product state | Attention | Client action? |
|---|---|---|---|
| `WAITING_ON_YOU` | `todo` or `in_progress` | `waiting_on_you` | Yes |
| `NEXUS_WORKING` | `waiting` | `nexus_working` | No |
| `UPCOMING` | `waiting` | `upcoming` | No |
| `BLOCKED` | `waiting` | `blocked` | No |
| `COMPLETE` | `complete` | `complete` | No |

An unreleased diagnosis approval therefore remains `upcoming`, even if a task row exists. It does not become a false client obligation before Nexus releases the report.

## 6. Nexus-owned task normalization

Nexus-internal tasks may appear in the projection only to answer what Nexus is doing.

- in-progress/review work -> `nexus_working`;
- not-started work -> `upcoming`;
- blocked work -> `blocked`;
- completed work -> `complete`.

They never become a client action merely because they share a project.

## 7. Document request normalization

A released/requested evidence request becomes a product upload task:

```text
sourceType = document_request
owner = client
actionType = upload
state = todo
attention = waiting_on_you
requiresAction = true
```

Draft requests do not project.

A fulfilled/uploaded request is complete from the client's responsibility perspective. Future DocumentService work may preserve a separate Nexus review state behind the product task if operationally necessary.

## 8. Attention projection

The service derives four deterministic attention slots:

```text
primaryAction
nexusWorking
upNext
blocked
```

The shell will eventually use these rather than independently sorting raw task/request tables.

Priority order for the product list is:

1. waiting on the user;
2. Nexus working;
3. blocked;
4. upcoming;
5. complete.

Within those groups, priority, lifecycle phase, due date, and title provide deterministic ordering.

## 9. What the projection does not do yet

The current core service intentionally does not yet:

- mutate database records;
- delete duplicate legacy records;
- rewrite approval chains;
- create a new table;
- replace `nexus_get_client_action_context`;
- redesign the shell;
- issue its own Supabase query;
- project founder/internal approval-chain work;
- perform fuzzy deduplication across unrelated records.

These are separate concerns.

## 10. Consumer integration rule

The existing `portal-client-core.js` already consumes `nexus_get_client_action_context` for the current client journey.

The correct integration sequence is:

1. adapt that existing consumer to call `projectTaskProjection` with its already-resolved action context;
2. pass the current `EngagementContext` and document requests into the same projection;
3. verify Home/Guide/Inbox behavior against the projection;
4. remove superseded local sorting/evaluation only after equivalent outcome coverage exists.

Do **not** add a second independent action-context fetch merely to populate the new projection.

## 11. Acceptance criteria for the integration commit

The consumer integration is complete when:

- old-project Moon Wax tasks do not appear in the active pilot's projected work;
- old-project Moon Wax document requests do not appear in the active pilot's projected work;
- the current client action comes from `attention.primaryAction`;
- unreleased diagnosis approval remains `upcoming`;
- Nexus in-progress work is visible as `nexusWorking`, not as a client obligation;
- project ambiguity produces no false action;
- browser/mobile/client-journey QA remains green;
- no new full-workspace or action-context query is introduced.

## 12. Next layer after integration

Once the Task projection is the authoritative client product surface, proceed to canonical `DocumentService` consolidation, then the simplified client shell.

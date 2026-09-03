# Nexus Canonical Engagement Context

**Directive:** NEXUS-APP-RESET-1.0  
**Status:** Implemented on reset branch; production promotion not yet authorized  
**Scope:** Authenticated Nexus application

## 1. Purpose

Nexus previously allowed several parts of the browser application to treat `projects[0]` as the effective active project. Other modules separately queried `nexus_active_engagements` and reordered the projects array so older code would see the intended project at index zero. That compatibility model made array ordering carry business meaning and allowed different modules to operate against different project contexts.

`EngagementContext` removes project-array order as a source of truth.

## 2. Source-of-truth hierarchy

For a selected company, the application resolves one product-level engagement context in this order:

1. **Explicit active engagement** — `nexus_active_engagements.company_id -> project_id` is authoritative when present and valid.
2. **Single open project fallback** — if no explicit pointer exists and exactly one non-terminal project exists, that project may be used as a bounded compatibility fallback.
3. **No open project** — no active project is available.
4. **Multiple open projects without an explicit pointer** — the context is ambiguous and the application must fail closed for project-scoped writes.

The projects array's position is never authoritative.

## 3. Canonical context shape

```text
EngagementContext
  companyId
  activeProjectId
  activeProject
  openProjectIds[]
  ambiguous
  source
```

`source` is one of:

- `explicit`
- `single_open_project`
- `none`
- `ambiguous`

## 4. Fail-closed conditions

The resolver rejects:

- an active-engagement pointer for a different company;
- an active-engagement pointer whose project is not in the selected company workspace;
- an active-engagement pointer to a terminal project;
- project-scoped mutations when multiple open projects exist and no explicit active engagement is available.

The resolver does not silently select the newest project, oldest project, first array element, diagnosis project, or project with the most recent activity.

## 5. Current application integration

The base portal now:

1. loads company projects;
2. reads `nexus_active_engagements` for the selected company;
3. resolves `EngagementContext`;
4. stores `activeProjectId` and `engagementContext` in canonical browser state;
5. loads project data requirements from `engagementContext.activeProject`;
6. renders the project summary from `engagementContext.activeProject`;
7. requires the active project for task, metric, milestone, and document-request creation;
8. uses request/requirement lineage or the canonical active project for the legacy/base document upload path;
9. reports explicit ambiguity rather than guessing.

## 6. Workspace-query coordination

The base portal also uses a single-flight `WorkspaceQueryCoordinator` keyed by company.

Concurrent identical workspace refreshes share one in-flight load. This prevents multiple UI modules from starting duplicate full-workspace reads at the same time.

The coordinator is intentionally **not** a permanent cache:

- after a load finishes, a later refresh can load fresh data;
- mutations use forced refreshes;
- sign-out invalidates all generations;
- company switching uses an explicit forced load;
- the existing latest-request controller still prevents stale company results from patching canonical state.

This is the first bounded-data-loader step. It does not yet eliminate all independent queries issued by legacy admin overlays.

## 7. Relationship to compatibility modules

`portal-foundation-hardening.js` and `portal-active-engagement-cohesion.js` still contain project-reordering compatibility behavior for legacy admin modules.

They are no longer the intended product-level source of truth.

They must remain until the admin dependency graph proves that every consumer can use `state.engagementContext` / `state.activeProjectId` directly. Retirement sequence:

```text
base EngagementContext authoritative
→ adapt legacy admin consumers
→ stop array reordering
→ remove duplicate active-engagement queries
→ archive cohesion/hardening compatibility behavior
```

Do not remove these modules prematurely.

## 8. Relationship to DocumentContext

`EngagementContext` answers:

> Which engagement/project owns project-scoped work for this company?

`DocumentContext` answers:

> Which company/project/task/request/requirement owns this specific upload?

For request- or requirement-bound uploads, that record's explicit lineage can identify the project. When several lineage sources are supplied, they must all agree. General project-scoped uploads require `EngagementContext`.

Both resolvers fail before storage writes when context is invalid or ambiguous.

## 9. Current limitation intentionally preserved

The current base workspace still loads company-wide task, document-request, notification, activity, milestone, metric, and document collections. `EngagementContext` prevents project guessing for project-scoped operations, but it does not yet decide what subset of those company-wide records should be presented to the user.

That concern belongs to the next layer: **Task projection / attention projection**.

Do not solve it by filtering ad hoc inside the shell.

## 10. Next contract

The next canonical service should project backend work into a small product-level Task model using:

- selected company;
- `EngagementContext`;
- actor role;
- task records;
- document requests;
- only the approvals that genuinely require a visible user action.

The shell should eventually consume that projection rather than raw tables.

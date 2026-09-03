# Nexus Canonical DocumentService

**Directive:** NEXUS-APP-RESET-1.0  
**Status:** Client product path implemented on reset branch  
**Production status:** Not deployed

## Purpose

Nexus now has one canonical client-side document persistence service: `core/document-service.js`.

The service exists to prevent upload/download behavior from being independently reimplemented by the base portal, the client shell, task attachments, and future Files views.

## Canonical ownership

`core/document-service.js` owns:

- company/project/task/request/requirement lineage resolution;
- fail-closed cross-company and cross-project validation;
- the 25 MB browser upload boundary;
- private storage upload to `nexus-client-documents`;
- `nexus_documents` metadata insertion;
- client/Nexus source-role persistence;
- document-area persistence;
- task attachment batching;
- rollback of an uploaded storage object when metadata persistence fails;
- secure signed-download target generation;
- authenticated blob-download fallback.

`core/document-context.js` remains the pure lineage resolver used by DocumentService.

## Client facade ownership

`portal-client-upload-service.js` is now a UI/facade module only.

It owns:

- current upload selection (`requestId`, `requirementId`, `taskId`, title);
- upload-context display and Clear behavior;
- client form interception in capture phase;
- delegation to `portal.services.documents`;
- the `portal.prepareUpload` compatibility facade;
- the `portal.downloadDocument` compatibility facade;
- loading task-file attachment controls.

It does **not** own:

- storage upload;
- `nexus_documents` insertion;
- lineage validation;
- the maximum file-size contract;
- rollback;
- secure download generation.

## Existing client consumers

The following client-facing consumers retain their existing interfaces while routing through DocumentService:

- Secure Data Room upload form;
- projected document-request actions;
- task-file attachments;
- `portal.prepareUpload(...)`;
- `portal.downloadDocument(...)`.

This means the shell does not need to understand storage buckets or database document metadata.

## Moon Wax regression guarantee

A document request associated with the older Opportunity Assessment cannot be persisted against the active financial-reconciliation pilot merely because that pilot appears first in an array.

DocumentService resolves request/task/requirement context before any storage write. Conflicting lineage fails before bytes are written.

## Transaction behavior

```text
selected task/request/requirement
        ↓
resolveDocumentContext
        ↓
company + project consistency check
        ↓
size / task-boundary validation
        ↓
storage upload
        ↓
nexus_documents insert
        ↓
audit log + optional workspace refresh
```

If the metadata insert fails after storage succeeds:

```text
metadata failure
      ↓
remove uploaded storage object
      ↓
rethrow original failure
```

## Download behavior

```text
document id
   ↓
lookup workspace document record
   ↓
short-lived signed URL
   ↓
if signing unavailable: authenticated blob download
   ↓
UI facade performs browser save
```

Storage access remains in DocumentService; browser DOM behavior remains in the facade.

## Compatibility debt retained intentionally

`portal-client.js` still contains the pre-reset base document upload/download implementation used by legacy/admin surfaces.

For the reconciled client runtime, `portal-client-upload-service.js` loads before the client shell and intercepts the upload form in capture phase, while replacing the client `portal.downloadDocument` facade with the canonical DocumentService-backed implementation.

The base admin path is therefore **compatibility debt, not canonical ownership**.

Do not add features to that legacy document path. It must be retired when the simplified admin shell is migrated to the canonical DocumentService.

This bounded decision avoids a high-risk full replacement of `portal-client.js` during the client-shell stabilization wave while still giving the active client product one document system.

## QA contract

The reset branch contains dedicated tests for:

- request-owned Moon Wax project resolution;
- conflict rejection before storage;
- client-task boundary enforcement;
- 25 MB enforcement;
- insert-failure rollback;
- multi-file task batching with one final refresh;
- signed downloads and authenticated fallback;
- facade delegation/no duplicate persistence;
- privileged-credential absence.

Relevant gates include:

- `Nexus Document Service QAQC`;
- `Nexus Client Action Inline Files QAQC`;
- `Nexus Direct Client Workflow Handoff QA`;
- `Nexus Control Room Reconciliation QA`;
- general Nexus QA;
- security and browser regression suites.

## Governance

Going forward:

1. Client UI modules may call DocumentService; they may not write document storage or `nexus_documents` directly.
2. New file size/security/lineage rules belong in DocumentService or server/database boundaries, not shell modules.
3. Client shell simplification must consume the existing document facade/service rather than create another Files backend.
4. Admin shell simplification must migrate off the legacy base document implementation before that implementation can be retired.
5. Database lineage guards remain authoritative defense in depth and must not be weakened because browser validation exists.

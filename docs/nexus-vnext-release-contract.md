# Nexus vNext — Diagnosis Experience Release Contract

Tracking issue: #49

This branch implements the requested Nexus client/admin experience upgrade while preserving the current internal diagnosis report schema and human approval/release boundaries.

## Non-negotiable invariants

- The existing diagnosis result keys and report section format do not change.
- `nexus_diagnosis_runs` remains admin-only/internal.
- Clients never receive the internal diagnosis record directly.
- Client-facing diagnosis content is a deliberate released projection of an approved internal report.
- Evidence is treated as untrusted data, never instructions.
- No external action or client communication is inferred from AI output without the existing human release gate.
- Report/PDF/Q&A access is company-scoped and role-scoped.
- SMS is optional and may only be marked delivered when a provider is configured and confirms delivery/acceptance.
- Issue #48 changes must be reconciled before production merge.

## Review lanes

1. Product/UX — request center, evidence cards, discovery brief, report reading/Q&A.
2. Diagnosis Intelligence — multi-pass evidence/process/verifier/composer quality.
3. Security/Governance — RLS, client-safe projection, authorization, prompt injection.
4. Operations/Coherence — evidence → diagnosis → review → release → Q&A → answer.
5. QA/E2E — contract, browser, role-boundary, failure-path and regression tests.

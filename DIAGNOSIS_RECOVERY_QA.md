# Diagnosis Recovery QA

Acceptance criteria for the failed-diagnosis recovery path:

1. A failed/blocked/revision-requested diagnosis with an existing transcript opens the recovery UI instead of creating a duplicate run.
2. `Resolve diagnosis issue` visibly opens the diagnosis modal.
3. The recovery modal must be visible with the existing `.open` class contract.
4. Queue Diagnosis must not scroll the user to the top merely to reopen an existing failed diagnosis.
5. The manual ChatGPT fallback remains available when the automatic provider is unavailable.
6. No client data, diagnosis evidence, or database schema is modified by this frontend repair.

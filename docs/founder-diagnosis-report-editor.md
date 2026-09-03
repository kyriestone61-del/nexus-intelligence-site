# Founder Diagnosis Report Editor

The founder editor changes only the client-facing diagnosis projection. It never mutates `nexus_diagnosis_runs.analysis_result`.

## Supported audited adjustments
- Replace executive summary
- Replace recommended first move
- Rewrite an opportunity
- Hide an opportunity from the client report
- Add a founder-authored opportunity

Each change is written through `nexus_add_diagnosis_report_adjustment` and can be restored through `nexus_revoke_diagnosis_report_adjustment`. The client report preview and release path are assembled by `nexus_effective_client_report`, preserving the original AI diagnosis as immutable provenance.

## Release boundary
Editing does not release anything to a client. Existing diagnosis approval and release controls remain authoritative.

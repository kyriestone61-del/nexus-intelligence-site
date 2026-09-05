# Relystra browser QA lane

This harness is intentionally isolated from the application runtime. It does not load in production and does not change portal code.

## Safe defaults

- `NEXUS_QA_BASE_URL` defaults to `https://nexusintelligence.live`.
- Smoke tests are read-only and may run against production.
- Authenticated role tests require dedicated QA credentials. Never use a real client's credentials in CI.
- Tests in this lane do not create, approve, delete, or mutate client records.
- Post-reset requirements that are known to fail the current baseline are gated behind `NEXUS_QA_ENFORCE_RESET=1` until the reset is ready for acceptance testing.

## Required QA identities for role-boundary tests

Configure repository secrets only after dedicated QA accounts exist:

- `NEXUS_QA_ADMIN_EMAIL`
- `NEXUS_QA_ADMIN_PASSWORD`
- `NEXUS_QA_CLIENT_EMAIL`
- `NEXUS_QA_CLIENT_PASSWORD`

Configure repository variable:

- `NEXUS_QA_COMPANY_NAME`

The client QA identity should belong to exactly one synthetic QA company so tenant-boundary assertions are deterministic.

## Reset acceptance expansion

After the reset lands, extend this lane with a dedicated disposable QA tenant to cover:

1. admin login and stable navigation;
2. client login and role isolation;
3. explicit active engagement selection;
4. transcript/evidence intake;
5. diagnosis blocked/recovery/review/approval;
6. client action submission and admin review;
7. stage-gate advancement rules;
8. password recovery;
9. mobile admin/client flows;
10. network/provider failure recovery.

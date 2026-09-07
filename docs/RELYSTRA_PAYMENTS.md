# Relystra payments — deployed test configuration

Updated September 7, 2026. The payment integration is deployed and verified with an actual Stripe TEST Checkout. It is not certified for live commercial payments.

## Verified deployment

- Relystra Stripe account: `acct_1UC3h0C88swJVkVO`.
- Stripe SDK 22.6.1, API `2026-08-26.dahlia`, hosted Checkout uses `ui_mode: hosted_page`.
- Existing Supabase project: `dmdgkjksouhhsuojthav`.
- Checkout: `https://dmdgkjksouhhsuojthav.supabase.co/functions/v1/nexus-diagnosis-execute?handler=checkout`.
- Webhook: the same existing Edge entrypoint with `?handler=stripe_webhook`. Separate new functions were not deployed because the project is at its function quota.
- `nexus-diagnosis-execute` version 21 serves the routed payment handlers. Custom authorization protects Checkout; Stripe raw-body signature verification protects the webhook.
- Test destination `we_1UCwIhC88swJVkVOE8xABvt5` handles `checkout.session.completed` and `checkout.session.async_payment_succeeded`.
- Checkout enabled; payment live mode false; manual paid fallback false; delivery emails false. Test checkout is restricted to the user-authorized Blue Harbor QA company.

The dedicated test runtime key, test webhook signing secret, account ID, portal origin and test-company allowlist are stored in Supabase's secret manager. Secret values and QA passwords are excluded from source and deliverables. Existing Statecraft and Human OS integrations remain separate.

## Actual acceptance evidence

A hosted Stripe test card payment created exactly one paid Build Package through the verified webhook:

| Evidence | Value |
| --- | --- |
| Company | Blue Harbor Facilities Group — NEXUS QA TEST |
| Plan | `30910dbf-d4b6-4e0b-902d-ba9a4346edf2` |
| Session | `cs_test_a1HG59EQjNbHBtenkmLosd4pq5mubF2ROyTRcUeYHRP8PkFVYFZqtaa2Mm` |
| Paid Project | `063b9501-3455-4c63-9d5c-b043eba15f5a` |
| Amount | USD 1,500 TEST |
| Payment recorded | September 7, 2026, 12:09:29 UTC |
| Live mode | false |

No real money was charged and no plan was manually marked paid. The earlier failed unpaid plan `7047b04f-2394-4eaf-bc7d-01f4b4cb0205` was cancelled through the portal before a replacement was created. The failure identified an obsolete Stripe UI mode; PR 148 and Edge version 21 corrected it without weakening idempotency.

Return navigation retained company, plan, paid project and historical diagnosis context. The purchased scope remained immutable throughout brief approval, draft revision, final QA and delivery.

## Launch boundary

Live Stripe account activation/verification, live secret and matching live webhook setup, and a separately authorized live transaction remain outstanding. Do not switch `payment_livemode` or claim live payment readiness on the strength of test-mode evidence. The current QA company allowlist does not authorize test checkout for Moon Wax.

Server-side fulfillment verifies signature mode, Stripe account, retrieved session, metadata, company, plan, scope digest, amount, currency and paid settlement. Local tests cover mismatches, replay/idempotency, cancellation and atomic activation. URL parameters alone never activate access.

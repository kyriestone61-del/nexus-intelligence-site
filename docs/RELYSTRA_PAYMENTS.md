# Relystra payments: deployment contract

This branch is pushed in draft PR #142; its migrations and functions remain unapplied. Checkout remains disabled by default. No production charge, Stripe product, webhook destination, secret or database record was created while implementing it.

## Account and runtime

The user selected **Relystra**, account `acct_1UC3h0C88swJVkVO`. The connector exposes its test and live modes. Existing Statecraft and Human OS payment integrations are separate and must retain their keys, products, endpoints and behavior.

The new handlers use Stripe Node SDK **22.6.1** and API **2026-08-26.dahlia**, verified against the installed SDK. Runtime checks retrieve the account owning the configured key and compare it with the claimed Build Plan and configured Relystra account. Test and live keys and signing secrets have separate names.

Store these values through the deployment platform's secret manager, never source files or browser configuration:

| Variable | Purpose |
|---|---|
| `RELYSTRA_STRIPE_ACCOUNT_ID` | Relystra account ID above |
| `RELYSTRA_STRIPE_TEST_SECRET_KEY` | Relystra test key; Checkout create/read/expire and current-account read permissions |
| `RELYSTRA_STRIPE_TEST_WEBHOOK_SECRET` | Signing secret for the Relystra test webhook destination |
| `RELYSTRA_PORTAL_ORIGIN` | Exact HTTPS origin; initially `https://nexusintelligence.live` |
| `RELYSTRA_STRIPE_LIVE_SECRET_KEY` | Only after live checkout is explicitly enabled for launch |
| `RELYSTRA_STRIPE_LIVE_WEBHOOK_SECRET` | Corresponding live destination signing secret |

The handlers also use the existing Supabase URL, anon key and service-role environment. Service credentials remain server-side. Keep the test webhook secret available while test payments are in flight even after new live checkout is enabled.

## Deployment and wiring

Apply migrations in order only after a fresh production parity check and the remaining delivery UI is integrated. `20260907000300` introduces the Build Plan and configuration records while extending existing opportunities, projects and system cards. `20260907000400` adds verified payment evidence and checkout/activation RPCs. Neither rewrites historical projects.

Deploy the payment handlers through the existing `nexus-diagnosis-execute` gateway, whose custom authentication is retained. This avoids exceeding the shared project’s Edge Function quota. The `handler=checkout` route validates the user token with Supabase Auth and applies plan RLS; the `handler=stripe_webhook` route authenticates Stripe through the verified raw-body signature. Standalone wrappers remain available for environments with separate function capacity. The webhook must receive these events:

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`

The webhook URL is `https://dmdgkjksouhhsuojthav.supabase.co/functions/v1/nexus-diagnosis-execute?handler=stripe_webhook`. Use the pinned API version when configuring the destination.

Set the single `nexus_delivery_settings` row to the Relystra account, `payment_livemode=false` and `checkout_enabled=true` only once the test secret and destination are verified. Manual payment fallback remains disabled. Do not set a plan or project paid to simulate payment.

The browser creates or opens a diagnosis plan with `relystra_create_diagnosis_plan(company_id)` or a selected Build Plan with `relystra_create_build_plan(company_id, build_ids, name)`. It invokes `nexus-diagnosis-execute?handler=checkout` with `{plan_id, operation: 'checkout'}` and follows only the returned Stripe URL. To release an unpaid selection it invokes the same handler with `operation: 'cancel'`.

The payment return URL keeps both company and plan context. The browser reloads the plan and displays verification pending until the database records payment; URL parameters never activate anything. Client UI is wired on this branch; deployed browser/payment verification remains outstanding.

## Behavior and evidence

The server snapshots fixed prices, selected Builds, included/excluded scope, acceptance criteria, dependencies, source findings, completed inputs and package duration before Checkout. Each plan has one immutable checkout claim and one Stripe idempotency key. A URL is returned only after the Stripe session is bound in the database. Cancellation expires an exposed Checkout Session before cancelling its plan; a completed session cannot be cancelled, including an asynchronous payment awaiting settlement.

Fulfillment verifies the raw signature, signing-secret mode, account, retrieved session, application metadata, company, plan, digest, amount, currency, completed status and paid settlement. Only a service-role RPC records evidence and activates access in one transaction. Replayed events reuse the original project. Failed activation rolls back evidence and payment state so delivery can retry. Diagnosis activates the existing `find` entitlement; a Build Plan activates one paid Project and one existing system card per purchased Build.

Local validation: `node --test qa/database/*.test.mjs`, plus `deno check` on both Edge entrypoints. Tests use PGlite with audited constraints/RLS and Stripe's real signature implementation. External notifications, actual Stripe API calls, deployed Edge behavior and browser payment interactions remain unverified. These tests are not Moon Wax acceptance evidence.

References: [Checkout Sessions](https://docs.stripe.com/api/checkout/sessions/create), [signature verification](https://docs.stripe.com/webhooks/signature), [fulfillment](https://docs.stripe.com/checkout/fulfillment), [session expiration](https://docs.stripe.com/api/checkout/sessions/expire).

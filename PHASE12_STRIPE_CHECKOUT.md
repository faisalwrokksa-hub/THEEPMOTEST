# The EPMO — Phase 12 Stripe Checkout integration

## Scope of this source milestone

A native **hosted Stripe Checkout, one-time payment** adapter for an existing tenant renewal invoice. It does not store card numbers or expose Stripe secret keys to the browser. A paid, raw-body-signed Stripe webhook is the **only** Stripe source that can activate/renew a subscription; checkout redirects never confer entitlements.

1. Tenant subscription administrators may create renewal invoices using `POST /api/v1/subscription/billing/renewal-invoice` or the bilingual `/billing` page (requires `pmoa_platform` authenticated capability).
2. Administrators use `POST /api/v1/subscription/billing/stripe/checkout` with JSON `{ "invoiceId": "<UUID>" }` to create/reuse hosted Checkout. Price, currency, owner tenant, and invoice identity are read from PostgreSQL, never from browser input. The server POSTs to Stripe with a stable invoice-specific `Idempotency-Key`. Returns a hosted `https://checkout.stripe.com/...` URL, and stores the session ID in `billing_stripe_checkout_sessions`.
3. Configure the native Stripe webhook URL `https://<public-api>/api/v1/billing/stripe-webhook` with event types `checkout.session.completed` and `checkout.session.async_payment_succeeded`. This webhook deliberately does not use a customer session; security is established by Stripe's timestamped signature of the **raw request bytes**. The NestJS `rawBody: true` configuration is required.
4. Only `payment_status='paid'`, `status='complete'`, `mode='payment'` Checkout events with valid live/test mode, recorded session ID, matching client_reference_id and metadata, exact amount/currency, an open invoice, the currently active tenant subscription, and matching billing-period boundary are settled.
5. A PostgreSQL tenant advisory lock and database transaction insert unique Stripe event receipt + payment ledger entry, update invoice, extend subscription, and append an audit event **atomically**. Same event replay is idempotent; a differently identified paid event for the same PaymentIntent is acknowledged as an already settled invoice. A distinct second payment for a paid invoice raises a conflict for manual reconciliation/refund.

**Not Stripe Billing recurring subscriptions:** This integrates manual renewals via one-time Checkout and verified payments. It does not automatically charge a stored payment method, manage mandates, prorate, calculate tax, issue statutory tax invoices, handle refunds/chargebacks, or fully synchronize payment failures. Those features require separate policy and provider work.

## Configuration and safety

The adapter defaults to **off**. Add to API environment (never `NEXT_PUBLIC_` variables):

```dotenv
STRIPE_ENABLED=false
STRIPE_SECRET_KEY=sk_test_REPLACE_WITH_REAL_TEST_KEY
STRIPE_WEBHOOK_SECRET=whsec_REPLACE_WITH_REAL_SIGNING_SECRET
```

When configured, change `STRIPE_ENABLED=true`. An enabled adapter fails at startup without both valid credentials. Production requires a `sk_live_` secret and HTTPS `WEB_ORIGIN`; configure the actual webhook endpoint secret from the Stripe Dashboard. Do **not** use the separate HMAC reference adapter in production. Stripe API credentials, signing secrets, card data and invoice amounts must never arrive from user-supplied request fields.

Set `WEB_ORIGIN` to the intended HTTPS customer website (first allowed origin when comma-separated). The customer returns to `/billing?billing=success` or `/billing?billing=cancelled` after Stripe Checkout. A return alone does not mark the invoice paid; refresh the billing page after webhook delivery.

**Note:** An API URL must be reachable from Stripe. When the public deployment routes only the Next.js web app, explicitly publish `/api/v1/billing/stripe-webhook` securely to the NestJS API (via nginx reverse proxy or equivalent). Stripe cannot reach an internal `api:4000` Docker hostname.

## Migrations and permissions

- Backup database; apply schema migration `0015_stripe_checkout_sessions.sql` using admin migration flow after `0014_billing_foundation.sql`.
- Re-run `pnpm db:rls` to grant the `pmo_app` application role appropriate access and revoke UPDATE/DELETE on Stripe checkout session references. In staging, verify policies with two tenants and unset tenant. The migration itself enables FORCE ROW LEVEL SECURITY.
- Confirm that `billing_invoices`, `billing_payments`, `billing_webhook_receipts`, and `billing_stripe_checkout_sessions` cannot be accessed across tenants by the application role.
- Do **not** run `drizzle-kit push --force` against production.

## Local tests and integration checklist

```bash
node --experimental-strip-types --test \
  apps/api/src/platform/stripe-policy.test.mjs \
  apps/api/src/platform/billing-policy.test.mjs \
  apps/api/src/platform/billing-reconciliation.test.mjs
node scripts/verify-stripe-integration.mjs
node scripts/verify-release-static.mjs
```

Then, in a real staging deployment with test credentials and test DB:

1. Run `pnpm build`, `pnpm typecheck`, migrations and RLS verification.
2. Start Stripe CLI forwarding webhook events to a locally reachable API, or configure a Stripe Dashboard test-mode endpoint, and obtain its actual `whsec_` secret.
3. Create a real open renewal invoice for Tenant A and open the hosted session. Use Stripe test payment data to complete Checkout, verify exactly one payment row and one period extension; test repeated delivery with fresh signed retry headers.
4. Try an unpaid or pending checkout and ensure **no** license extension. Validate amount/currency mismatches, forged/replayed signatures, tenant B's session/invoice and older subscription sessions are rejected.
5. Test cancellation while Checkout is open, secondary payments for one invoice, duplicate Stripe event IDs with modified payload, Stripe delivery retries after DB outage, and auditing of suspicious conflicts.
6. Review operational alerts for refunds, chargebacks, disputes, expired sessions, stale unpaid invoices, customer support and Stripe payout reconciliation before enabling live charging.

## Milestone verification boundaries

This archive includes source and focused automated tests. It does **not** include live Stripe credentials or a running Postgres instance. Actual Stripe API requests, provider callbacks, NestJS runtime integration, full TypeScript typechecking with repository dependencies, and live migration execution have not been verified in this environment. Do not call this payment integration production-ready until those steps pass.

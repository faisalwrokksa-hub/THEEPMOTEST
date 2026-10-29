# The EPMO — Phase 12 Stripe staging-readiness milestone

## Delivered source updates

1. **Checkout retry repair.** The Stripe idempotency key is now scoped to the persisted checkout attempt count, not the invoice alone. An *already recorded* expired session can be replaced with a newly keyed attempt. Network retry before a session is recorded still reuses the same key for that attempt. The previous fixed invoice key could continually return an expired Stripe session.
2. **Production-build staging mode.** The API may use Stripe `sk_test_` keys even with `NODE_ENV=production` **only when** `DEPLOYMENT_ENV=staging` and `STRIPE_ALLOW_TEST_MODE_IN_PRODUCTION=true` are both present. Live production defaults remain strict; never set these overrides in production.
3. **Offline staging preflight.** `node scripts/stripe-staging-preflight.mjs` checks nine staging configuration requirements, including test-only credentials, URL shape, database environment presence, and disabled reference webhook. It never contacts Stripe or the database and never prints credentials. The public webhook URL is an operational configuration value for the check; it is not exposed as a client setting.
4. **Regression tests.** Stripe retry and mode-guard tests plus staging preflight tests. No new database migration is needed for this milestone.

## Staging validation commands

```bash
# In the API staging environment (populate values via secure secret manager):
export NODE_ENV=production
export DEPLOYMENT_ENV=staging
export STRIPE_ALLOW_TEST_MODE_IN_PRODUCTION=true
export STRIPE_ENABLED=true
# Provide STRIPE_SECRET_KEY=sk_test_... and STRIPE_WEBHOOK_SECRET=whsec_... securely.
# Provide DATABASE_URL=postgres://... and WEB_ORIGIN=https://staging.theepmo.com.
export STRIPE_WEBHOOK_PUBLIC_URL=https://api-staging.theepmo.com/api/v1/billing/stripe-webhook
node scripts/stripe-staging-preflight.mjs

# Dependency-free tests:
node --experimental-strip-types --test apps/api/src/platform/stripe-policy.test.mjs \
  apps/api/src/platform/billing-policy.test.mjs \
  apps/api/src/platform/billing-reconciliation.test.mjs \
  scripts/stripe-staging-preflight.test.mjs
node scripts/verify-stripe-integration.mjs
node scripts/verify-release-static.mjs
```

The preflight **only verifies the presence/format of configuration**; it does *not* establish that a secret is genuine, a webhook route is reachable, or a database connection works.

## Required real test-mode exercise (NOT executed in this milestone)

1. With a staging PostgreSQL instance and dependencies installed, back up the database, run and verify migrations through `0015_stripe_checkout_sessions`, reapply RLS for the `pmo_app` application role, run `pnpm build` and `pnpm typecheck`.
2. Configure the **actual** Stripe Dashboard test-mode webhook destination and signing secret for `POST /api/v1/billing/stripe-webhook`. Confirm a Stripe event reaches the correct NestJS API via HTTPS with unmodified raw body. Set `WEB_ORIGIN` to the HTTPS staging web origin.
3. Log in as a Tenant A billing admin; generate one open renewal invoice, create Checkout, pay with an official Stripe test card, and check the invoice became paid and the subscription extended **once**. The redirect alone must never activate a renewal.
4. Retry the identical signed event; check no second ledger entry or extension. Then send a different signed paid event for the same payment intent; ensure it is treated as already settled. Check the paid event fails if amount/currency/tenant metadata differs.
5. Create a second Tenant B and verify the Tenant A admin cannot read/create Tenant B invoices or sessions; test RLS with `pmo_app` across tenants and with no tenant set.
6. Leave a Checkout session unpaid/expired and verify no new entitlement. Retry an **expired recorded** session to verify a fresh session is created. Test outage/retry, subscription cancellation, expired plan, refunds/disputes and operational alerting.
7. Compare staging Stripe balances/payment intents with billing ledger; verify production secrets are held in a secret manager. Obtain security approval before switching to live keys.

## Unresolved before production

- The workspace has **no configured Stripe API credentials, reachable staging API, PostgreSQL server, or installed workspace dependencies** in this execution environment. Real Stripe Checkout, signed webhook delivery, database isolation, and full app compile were therefore **not** tested here.
- If Stripe successfully creates a session but the client loses the response **before that session is saved** in the database, repeated retries of that same attempt remain tied to the same Stripe key. A production-quality reconciliation/recovery policy is still needed for this rare ambiguous response/expiration scenario.
- Payment disputes, refunds/chargebacks, tax invoicing, and automatic stored-card recurring charging remain separate outstanding scope.


## Follow-up: replay-safe staging acceptance evidence

See `PHASE12_STRIPE_TEST_MODE_EVIDENCE.md` for the read-only, two-tenant Stripe test-mode evidence collector, baseline/verification workflow, and replay-check assertions. This package still requires a real staging deployment.

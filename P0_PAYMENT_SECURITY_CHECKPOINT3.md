# The EPMO — P0 Payment Security Checkpoint 3

## Confirmed issues addressed

1. **Production deployment mode ambiguity**: Previously a server with `DEPLOYMENT_ENV=production` but `NODE_ENV=development` could accept test Stripe keys. `stripeDeploymentModeAllowed` now treats the deployment target as authoritative and rejects mismatched key/runtime combinations.
2. **Reference settlement simulator in deployed environments**: Previously the signed reference webhook checked only `NODE_ENV`; with a misconfigured `NODE_ENV`, the simulator might be enabled in production or staging if its opt-in and secret were present. The reference adapter now rejects both staging and production based on `DEPLOYMENT_ENV`, independently of `NODE_ENV`.
3. **Stale Stripe source gates**: Updated two assertions to enforce tenant administrator (not vendor Super Admin) checkout permission and the presence (rather than final position) of the Stripe migration in the journal.

## Local verification

Run from repository root:

```sh
node --experimental-strip-types --test apps/api/src/platform/stripe-policy.test.mjs apps/api/src/platform/billing-policy.test.mjs
node scripts/verify-stripe-integration.mjs
node --experimental-strip-types --check apps/api/src/platform/stripe-policy.ts
node --experimental-strip-types --check apps/api/src/platform/billing-policy.ts
node --experimental-strip-types --check apps/api/src/platform/billing.service.ts
npm run test:offline
npm run verify:static
npm run verify:migrations
```

## Pending high-priority work

- Confirm legal eligibility of the operating entity to accept payments with Stripe in its incorporation country.
- Define and implement refund/chargeback handling; the existing webhook only settles successful Checkout events.
- Verify payment fulfillment when payment arrives after plan cancellation or plan replacement. The present code rejects mismatched subscription state; a live payment could require manual reconciliation/refund.
- Run a real test-mode Checkout, signed webhooks, PostgreSQL RLS tests, and full application build on staging.

**These source-level tests are not production authorization.**

# Phase 12 — Stripe staging PostgreSQL isolation milestone (verified locally)

Baseline: `the-epmo-phase12-stripe-staging-e2e-evidence.zip`.

## Implemented

- `scripts/stripe-db-rls-audit.mjs`: read-only staging financial-table row-level security acceptance gate using the app-only PostgreSQL role and two seeded tenants.
- `scripts/stripe-db-rls-audit.test.mjs`: 17 dependency-free tests including missing policies, privileged roles, missing seeded data, and cross-tenant leaks.
- `package.json`: commands `test:stripe:db-rls` and `verify:stripe:db-rls`.
- `PHASE12_STRIPE_POSTGRES_RLS_GATE.md`: operator setup and security limits.

## Commands run in this development environment

```sh
node --experimental-strip-types --test \
 apps/api/src/platform/billing-policy.test.mjs \
 apps/api/src/platform/billing-reconciliation.test.mjs \
 apps/api/src/platform/stripe-policy.test.mjs \
 packages/db/src/subscription-lifecycle.test.mjs \
 packages/db/src/subscription-transitions.test.mjs \
 scripts/stripe-staging-evidence.test.mjs \
 scripts/stripe-staging-preflight.test.mjs \
 scripts/stripe-db-rls-audit.test.mjs
# PASS 116/116

node scripts/verify-stripe-integration.mjs
# PASS 22/22

node scripts/verify-release-static.mjs
# PASS 8/8

DEPLOYMENT_ENV=production node scripts/stripe-db-rls-audit.mjs
# BLOCKED (expected), exit status 1
```

## Not claimed

No actual staging PostgreSQL connection, no database migration run, no real Stripe test-mode charge, no signed test webhook delivered, and no full application build/typecheck. `pnpm`/workspace dependencies are unavailable and the package registry is inaccessible in this environment.

Before any production launch, install dependencies in staging CI, run `pnpm db:migrate`, reapply `packages/db/sql/rls.sql`, run this new database audit and adverse write tests as `pmo_app`, run a real Stripe test-mode Checkout/webhook/replay sequence, and complete full build and end-to-end tests.

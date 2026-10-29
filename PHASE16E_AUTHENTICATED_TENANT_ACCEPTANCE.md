# The EPMO — Phase 16E: authenticated tenant-isolation acceptance

## Delivered

Extended the existing **live, destructive CI-only** billing acceptance file,
`tests/phase15-billing-isolation.test.ts`, with seven integration cases covering:

1. Two signed-in organization owners see populated, tenant-scoped project pages.
2. Direct lookup of a real foreign project UUID returns HTTP 404 in both directions.
3. Spoofed `x-tenant-id` and `x-user-id` headers cannot override a valid owner session.
4. A tenant owner cannot switch into another organization without membership.
5. A person with memberships in both organizations can switch and sees only the selected tenant's projects; foreign project IDs stay inaccessible.
6. Switching the shared user's workspace cannot change either owner's session.
7. Invoice visibility and administrator restrictions remain correct after switching.

The suite uses **real HTTP sessions and real PostgreSQL records**. It is **not** run by `test:offline` and is intentionally skipped in ordinary `pnpm test`. The existing controlled, disposable acceptance test creates the shared fixtures once; the new tests do not reseed or create subscriptions again.

Reusable fail-closed assertions are in `scripts/phase16e-tenant-assertions.mjs`. Their unit tests and CI/source wiring checks are included in `test:offline`.

## Verification commands

From the repository root, on Node 22:

```sh
npm run test:offline
node scripts/verify-migration-chain.mjs
node scripts/verify-release-static.mjs
```

In a **disposable local test environment only**, after deploying PostgreSQL, applying migrations and RLS, seeding demo data, and starting the API:

```sh
NODE_ENV=test \
PHASE15_BILLING_ACCEPTANCE=true \
PHASE15_ACCEPT_DISPOSABLE_DB=YES_RESEED_DISPOSABLE_TEST_DATABASE \
DATABASE_URL='postgres://pmo_app:<test-password>@localhost:5433/pmo' \
DATABASE_URL_ADMIN='postgres://postgres:<test-password>@localhost:5433/pmo' \
TEST_API='http://localhost:4000' \
pnpm exec vitest run tests/phase15-billing-isolation.test.ts
```

The example credentials above are placeholders; use environment-managed test secrets. **Never run this test against customer, staging, or production data**: it intentionally deletes and reseeds demo tenants. `phase15c-acceptance-safety.mjs` enforces test-only/loopback safeguards, but a loopback tunnel is not proof of a disposable database.

## Evidence / limitations

- Offline helper tests verify assertion behavior with synthetic data; CI/source wiring tests verify the live suite is registered. **Neither proves real tenant isolation.**
- Phase 16E live assertions run only when CI starts the API and PostgreSQL, and CI must report them passing before calling this acceptance complete.
- No full dependency-backed build, live PostgreSQL test, Stripe payment, or SES delivery was executed while preparing this package.
- The full project is **not production-ready** until the deferred staging acceptance gates pass.

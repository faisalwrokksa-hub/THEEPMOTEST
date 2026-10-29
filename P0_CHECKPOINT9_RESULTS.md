# P0 Checkpoint 9 — Verification record

Source baseline: `the-epmo-p0-deployment-transport-checkpoint8.zip`.

## Executed here

- `npm run test:offline`: **688 passed, 0 failed** (10 new source-level session revocation tests).
- `node scripts/verify-release-static.mjs`: **8/8 groups passed**.
- `node scripts/verify-migration-chain.mjs`: **19 SQL migrations aligned**.
- `node --experimental-strip-types --check` on five modified `.ts` files: **passed**.
- ZIP archive integrity: verified on release packaging.

## Not executed

- New live Vitest API cases in `tests/auth.test.ts`: requires running API, PostgreSQL and seed data.
- Full dependency-backed Next.js / NestJS application build.
- Real PostgreSQL security tests, Stripe test payments, SES delivery and browser acceptance.

## P0 open items

- Password reset and account recovery are still **not implemented** as part of this change. Do not weaken the `pmo_app` database privilege restriction to implement them; use a specifically reviewed privileged path and token lifecycle.
- Confirm logout-all against two independent browser sessions and audit log on staging.
- Confirm critical security behavior with a deployed HTTPS reverse proxy.

# Phase 15A — Billing integration and tenant-isolation acceptance

## Delivered

- `tests/phase15-billing-isolation.test.ts` performs HTTP requests against a **running NestJS API** backed by **real PostgreSQL**, using two seeded organizations. It creates a test-only subscription plan and invoices for each workspace, verifies unauthorized access is refused, verifies tenant-specific invoices and subscription details, and checks that cancellation changes only the signed-in tenant.
- `.github/workflows/ci.yml` runs the live acceptance suite **after** SQL migrations, forced-RLS checks, demo seeding, and the API health check. The CI step explicitly sets `PHASE15_BILLING_ACCEPTANCE=true` to prevent accidental fixture writes during ordinary local tests.
- `tests/phase15-ci-coverage.test.mjs` provides four **dependency-free source checks** for registration, test-fixture non-vacuity, and coverage structure.

## What has and has not run

- The dependency-free source suite, static release checks, and migration-chain checks can be run locally with Node 22. These have passed in this checkpoint.
- **The live billing integration suite has NOT been executed** in this environment. It requires pnpm packages, a running API, PostgreSQL with migrations and RLS, and seed users. Its CI wiring is in place, but GitHub Actions execution has not been observed.
- This test does not settle a real Stripe payment and does not verify SES email delivery, browser accessibility, or the full production deployment.

## Running on a configured CI/staging test environment

1. Configure a **disposable** PostgreSQL database and `DATABASE_URL_ADMIN` for a database administrator, plus the restricted `DATABASE_URL` for `pmo_app`.
2. Apply the ordered SQL migrations and tenant RLS policies, provision the restricted application role, seed demo identities with `pnpm db:seed`, and start the API with `NODE_ENV=test` and session-based auth enabled.
3. Run `PHASE15_BILLING_ACCEPTANCE=true pnpm exec vitest run tests/phase15-billing-isolation.test.ts`.
4. Check for six passing live tests. A failed or skipped test is not successful evidence of isolation.

**CAUTION:** This suite calls `reseed()`, which deletes and recreates the named **demo** organizations and accounts. Run only on a disposable test database, never against production or customer data. Do not set `PHASE15_BILLING_ACCEPTANCE=true` in production environments.

## Next release gates

- Run CI against an actual PostgreSQL service and diagnose/fix any live-test failures.
- Complete TypeScript builds for the web and API applications.
- Execute Stripe **test-mode** checkout + webhook + single renewal validation on staging.
- Verify Amazon SES invitations, bilingual browser journeys, and final security audit.

No production-readiness claim is made by this checkpoint.

# The EPMO — P0 Checkpoint 11: Build and Database CI Acceptance

**Source baseline:** `the-epmo-p0-password-recovery-checkpoint10.zip`.

## Why this checkpoint

The previous package included a secure recovery migration and opt-in live acceptance tests, but GitHub Actions did **not** run `tests/password-recovery.test.ts` with the necessary opt-in. A green run therefore could not confirm the password-reset SECURITY DEFINER function, old-session revocation or token replay protection. This checkpoint closes that **CI coverage gap**; it does not claim any cloud or PostgreSQL environment was run locally.

## Source changes

1. `.github/workflows/ci.yml`: make recovery an explicit integration step **after the live API, PostgreSQL migrations and RLS setup**. The step opts in to the destructive disposable-database fixture with `P0_RECOVERY_LIVE_ACCEPTANCE=true` and `PHASE15_ACCEPT_DISPOSABLE_DB=YES_RESEED_DISPOSABLE_TEST_DATABASE` and points at localhost.
2. `scripts/phase15e-release-evidence.mjs`: adds `recovery_api` as a required **current-run** CI gate. No recovery receipt, no passing CI acceptance. The launch profile continues to require separate Stripe, SES and human bilingual-browser acceptance.
3. `tests/password-recovery.test.ts`: adds a **live concurrent token-redemption** check that races two different passwords against the same one-use recovery link. Exactly one reset must succeed, one must fail, and exactly one password-reset event must be logged.
4. `tests/phase15e-release-evidence-ci.test.mjs` updates its expected evidence mapping; `scripts/p0-build-db-ci-gate.test.mjs` introduces seven focused source tests, including a missing-recovery-evidence failure case.

## Local verification performed

| Check | Observed result |
|---|---|
| `npm run test:offline` | **707/707 passed**, including 7 new tests |
| `node scripts/verify-release-static.mjs` | **8/8 groups passed** |
| `node scripts/verify-migration-chain.mjs` | **20 migrations and SHA-256 manifest verified** |
| `node scripts/rc1-release-gate.mjs` | **9/9 passed** |
| TypeScript 5 parser on project source files | **223 files parsed, zero syntax diagnostics** |
| CI workflow YAML parse | **Passed** with PyYAML 6.0.3 |
| Existing build artifacts | **0/4 package outputs present** — expected for source-only environment |
| GitHub CI / Postgres / full build | **NOT executed here** |

**Runtime blocker:** `corepack pnpm --version` could not fetch pnpm 10.17.0 due to DNS resolution failure for `registry.npmjs.org`. `npm ping` had the same DNS failure. PostgreSQL (`psql`) and Docker are absent. Do not describe syntax parsing as TypeScript typechecking or a build.

## Run the actual acceptance

1. Push this source package to a **private** GitHub repository with Actions enabled. Do not push real `.env` files, customer data, database backups, or payment keys.
2. Run the `CI` GitHub Actions workflow. Its `verify` job installs pnpm, builds the workspace packages, applies 20 real SQL migrations, applies RLS and effective database privilege gates, typechecks source, runs tenant and billing isolation, starts the compiled API, tests recovery against the disposable PostgreSQL database, builds the Next.js app and runs the compiled-web smoke checks.
3. Confirm **all ten current-run CI receipts**, including `recovery_api`, exist and are green. Review the generated sanitized evidence artifact. The `audit` job must also pass.
4. Resolve any compiler, PostgreSQL, migration, API, browser, or dependency-audit errors before advancing. A green CI workflow still does **not** prove external SES, Stripe payment, or production readiness.
5. Later, run the separate launch acceptance checks: Stripe test payment and refund/dispute flow, SES message delivery, human Arabic/English browser review, HTTPS, monitoring and restore rehearsal.

**Status:** CI integration gate authored and locally tested. Real full build, database execution and production acceptance **remain outstanding**.

# Phase 17B — Concurrent Migration Safety (source milestone)

## Problem addressed

Before this patch, both the CI SQL-ledger migrator (`scripts/apply-sql-migrations.sh`) and the staging/production bootstrap (`infra/bootstrap-db.sh`) performed an out-of-transaction `SELECT` to decide whether to run each SQL migration. Two deployments arriving at the same time could both observe a missing ledger row and both attempt the same DDL.

## Changes

1. Both runners serialize creation of `public.schema_migrations` with `pg_advisory_xact_lock(1717, 2026)` in a transaction.
2. For each unapplied migration they now use `BEGIN`, `LOCK TABLE public.schema_migrations IN EXCLUSIVE MODE`, and an in-transaction `SELECT NOT EXISTS (...) AS needs_apply \\gset`. The `psql \\if :needs_apply` condition encloses the SQL migration **and** its ledger insert, with COMMIT after the condition.
3. After waiting for the ledger lock, a competing runner re-reads the ledger and skips DDL already applied by another runner.
4. Existing rollback-on-error and final exact-ledger-verification behavior remain.
5. Updated an older bootstrap assertion to cover the new conditional form; added six regression checks, including inspection of SQL emitted by the CLI runner and confirmation that a subsequent invocation skips completed migrations.

## Checks performed here

- `npm run test:offline`: **573/573 passed** (six additional tests since Phase 17A)
- `node scripts/verify-release-static.mjs`: **8/8 passed**
- `node scripts/rc1-release-gate.mjs`: **9/9 passed**
- `node scripts/verify-migration-chain.mjs`: **18 migration definitions verified against SHA-256 manifest**
- `bash -n infra/bootstrap-db.sh scripts/apply-sql-migrations.sh`: passed
- New test command: `node --test scripts/phase17b-concurrent-migrations.test.mjs`: **6/6 passed**

## Verification boundary

These are source checks and a mocked `psql` protocol test, **not live concurrency tests**. A real PostgreSQL integration test involving simultaneous migrators remains required. So do the full app build, tenant RLS, Stripe test-mode payments, SES invitations and browser acceptance.

A connected CI/staging environment with Node.js, pnpm, Docker/PostgreSQL and relevant service credentials is necessary for the live acceptance checks. None was available in the current execution environment. Do not deploy to production on this milestone alone.

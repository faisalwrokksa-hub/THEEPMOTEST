# The EPMO Phase 12 — RC1 SQL migration parity checkpoint

**Scope:** Offline hardening of CI and staging deployment migration consistency. This does not constitute a live PostgreSQL test, a complete application build, or a Stripe payment acceptance test.

## Implemented

- `.github/workflows/ci.yml` now executes `scripts/apply-sql-migrations.sh` instead of `pnpm db:migrate`. This matches the ordered SQL migration files and the `public.schema_migrations` ledger used by the production/staging `infra/bootstrap-db.sh`. CI continues to apply row-level security immediately afterwards and checks the six financial RLS tables.
- The SQL runner validates the Drizzle journal/file list, rejects a database containing Drizzle's **other** migration ledger, refuses to execute with the `pmo_app` role, wraps every migration and its ledger insert in the same transaction, verifies the exact final ledger, and requires an explicitly configured PostgreSQL administrative connection via `PGHOST`, `PGUSER`, `PGDATABASE`, and `PGPASSWORD` (optional `PGPORT`). It does not print credentials.
- `infra/bootstrap-db.sh` explicitly enables `LOGIN` when updating `pmo_app` credentials. Previously, an account created as `NOLOGIN` by the standalone RLS script would remain unable to connect after bootstrap.
- Offline mock-psql regression tests cover a successful complete upgrade, repeat runs, failure rollback reporting, conflicting migration journals and CI configuration. **Mocks do not execute SQL against PostgreSQL.**

## Verify locally without dependencies

```sh
npm run test:offline
node scripts/verify-migration-chain.mjs
node scripts/verify-release-static.mjs
node scripts/rc1-release-gate.mjs
bash -n scripts/apply-sql-migrations.sh infra/bootstrap-db.sh infra/deploy.sh
```

## Real staging acceptance still required

1. Take and verify a restorable database backup. Confirm the target database has **either** `public.schema_migrations` (SQL runner path) **or** Drizzle's migration journal, never silently mix the histories; escalate any mismatch rather than deleting a ledger.
2. Install dependencies, complete `pnpm typecheck`, build web/API, and run the CI integration workflow with PostgreSQL 16. In CI the SQL runner is supplied `PG*` variables only for its own step.
3. Use the restricted `pmo_app` connection to prove `FORCE ROW LEVEL SECURITY` and tenant isolation across billing records. Verify that no-tenant requests see no tenant-scoped records.
4. Complete a Stripe *test-mode* Checkout, signed webhook processing, double-delivery/idempotence check, and subscription renewal verification against staging.
5. Conduct English/Arabic user acceptance testing and review logs, backups, TLS, reverse-proxy and access controls.

**Release decision:** **BLOCKED** until the real PostgreSQL, build and Stripe staging tests pass. This package fixes source-level deployment risk; it does not authenticate any running deployment.

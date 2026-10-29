# Phase 12 — Migration-history and PostgreSQL policy CI gate

This increment hardens the deployment verification pipeline without assuming a live staging environment is connected.

## Changes

1. `scripts/verify-migration-chain.mjs`: validates every numbered SQL migration against `packages/db/migrations/meta/_journal.json`, catching missing, unjournaled, out-of-order, duplicate, or empty migration files.
2. `scripts/verify-migration-chain.test.mjs`: 11 dependency-free unit tests, including the actual source migration history.
3. `package.json`: `verify:migrations` and `test:offline` scripts (Node 22 with TypeScript stripping for the existing policy-test imports).
4. `.github/workflows/ci.yml`: source checks now include the migration-chain verifier and offline tests. The database job runs `pnpm db:migrate` rather than `pnpm db:push`, and asserts financial RLS on PostgreSQL after policies are applied.
5. `packages/db/sql/assert-financial-rls.sql`: fails the PostgreSQL CI job if the restricted app role is privileged, six financial tables are missing, RLS is not enabled and forced, or tenant isolation policies are absent.

## Local verification

```bash
node scripts/verify-migration-chain.mjs
npm run test:offline
node scripts/verify-release-static.mjs
```

## Staging / CI verification still required

The SQL assertion runs after migrations and `packages/db/sql/rls.sql` in GitHub Actions with PostgreSQL 16. **It has not been executed against PostgreSQL in this environment.** Validate both a fresh install and an upgrade clone. A real Stripe Checkout test, a real webhook, and cross-tenant database mutation tests also remain required before production.

## Important operational details

- The CI database is disposable, so applying all journaled migrations does not risk customer data.
- Do **not** run database setup scripts against a customer production database without backup, maintenance procedures, and reviewed roles and secrets.
- A source-only migration check cannot prove SQL execution will succeed. A successful future CI workflow is the required evidence.

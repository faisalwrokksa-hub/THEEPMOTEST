# Phase 17C — Prevent incorrect migration commands

## What changed

- Root `npm run db:migrate` now executes `scripts/apply-sql-migrations.sh`, the
  **same** SQL-ledger runner used by CI and staging bootstrap (`public.schema_migrations`).
- `pnpm --filter @pmo/db migrate` and the old TypeScript migrator explicitly
  refuse to run. They used `drizzle.__drizzle_migrations`, a conflicting ledger.
- Drizzle schema push remains usable **only** for disposable, local development;
  `--force` was removed, and it requires
  `EPMO_ALLOW_LOCAL_SCHEMA_PUSH=YES_I_UNDERSTAND DEPLOYMENT_ENV=development`
  plus the local PostgreSQL admin URL `postgres://postgres:...@localhost:5433/pmo`.
  Explicit opt-in must be in the shell, not a copied `.env` file.

## Operator checklist (staging)

1. Back up the database and rehearse the restore to an isolated database.
2. Run `node scripts/verify-migration-chain.mjs` in the release checkout.
3. Configure the administrator `PGHOST`, `PGPORT`, `PGUSER`, `PGDATABASE`,
   `PGPASSWORD` securely; do not use the `pmo_app` restricted role.
4. Run `npm run db:migrate` from the root. Apply and verify RLS policies.
5. Run the live API and tenant-isolation acceptance gates before approving release.

## Verification limits

Node offline tests and source checks were run locally. **No actual PostgreSQL
migrations, NestJS/Next.js build, Stripe settlement, or deployment occurred.**
The staging runtime prerequisites must still be provided; production launch is
not approved by this milestone.

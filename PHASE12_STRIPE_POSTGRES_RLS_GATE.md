# The EPMO — Phase 12 Stripe PostgreSQL tenant-isolation staging gate

This milestone extends the Stripe test-mode acceptance evidence with an **actual PostgreSQL read-only RLS audit tool**. The tool ships in source; **no live PostgreSQL connection was available during this development run**.

## Files

- `scripts/stripe-db-rls-audit.mjs` — staging-only command, against the restricted `pmo_app` database role.
- `scripts/stripe-db-rls-audit.test.mjs` — dependency-free mocked-database tests covering positive and denial cases.
- `package.json` — `test:stripe:db-rls` and `verify:stripe:db-rls` commands.

## Safe staging procedure

1. Deploy the latest migrations through `0015_stripe_checkout_sessions.sql` to a disposable or isolated staging database. Rerun the official `packages/db/sql/rls.sql` role and RLS setup. **Do not** run this audit against customer production data.
2. Prepare TWO *distinct* staging tenants, each with a subscription. Tenant A needs at least one billing invoice; ideally add independently generated invoices for Tenant B too. Use IDs you manage from your staging environment.
3. Inject these values from the staging secret manager, not in Git, chat messages, or source ZIP files:

   - `DEPLOYMENT_ENV=staging`
   - `DATABASE_URL=postgresql://pmo_app:...@<staging-host>/<staging-db>` (restricted application role; **never** `DATABASE_URL_ADMIN`)
   - `STRIPE_DB_TENANT_A_ID=<tenant-A-UUID>`
   - `STRIPE_DB_TENANT_B_ID=<tenant-B-UUID>`

4. With dependencies installed (`pnpm install --frozen-lockfile`), run:

```bash
node --test scripts/stripe-db-rls-audit.test.mjs
node scripts/stripe-db-rls-audit.mjs
```

## Checks made at runtime

- Enforces `DEPLOYMENT_ENV=staging`, two distinct UUIDs, and a `pmo_app` database connection.
- Confirms PostgreSQL's connected role is `pmo_app`, not SUPERUSER and without `BYPASSRLS`.
- Confirms all six financial tables exist, have RLS **enabled and forced**, and have policy entries.
- Queries each financial table with **no tenant WHERE clause**, under **read-only transactions** using transaction-local `app.tenant_id` for tenant A, tenant B, and no tenant.
- Aggregates *all visible rows* by tenant ID, not just a 100-row page. Rejects unexpected tenant IDs or any rows visible with no tenant selected.
- Refuses a false green result if either tenant lacks subscriptions or tenant A has no invoice.

The tool does not update, insert, or delete any database rows and prints only per-tenant record counts. Its database driver comes from `@pmo/db`'s `postgres` dependency once the workspace dependencies are installed. It does not require Stripe credentials.

## Limitations and release requirements

A read-only isolation audit **cannot prove** rejected cross-tenant writes or payment correctness. Separately run adversarial RLS INSERT/UPDATE tests in a throwaway PostgreSQL database and verify a real Stripe test-mode Checkout, signed webhook, idempotency/replay, and renewal with `scripts/stripe-staging-evidence.mjs`. Also complete the full pnpm build and type checks, then repeat release checks in deployment CI. **Do not enable production payments based only on mocked tests or this audit.**

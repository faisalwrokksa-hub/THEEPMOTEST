# The EPMO — P0 Checkpoint 5: Tenant and Global-Account Privilege Hardening

## Confirmed risk and code changes

1. **Critical privilege-scope correction:** `packages/db/sql/rls.sql` previously restored blanket `INSERT, UPDATE` on the global `users` table to the `pmo_app` database role. The global table includes `is_platform_admin`, so broad write privileges were inappropriate. The RLS script now revokes broad writes, then grants only `INSERT (email, display_name, password_hash)` for the invitation flow and `UPDATE (failed_attempts, locked_until, last_login_at)` for authentication lockout and sign-in bookkeeping. Read access remains for authentication and record references. This is database defense in depth, not a substitute for route authorization or tenant RLS.
2. **Real database acceptance gate:** `packages/db/sql/assert-global-role-privileges.sql` rejects a privileged/bypass-RLS app role, any blanket account writes, updates to platform-admin, active, email or password fields, and missing needed auth privileges. The gate is run immediately after RLS in `infra/bootstrap-db.sh` and in GitHub Actions CI.
3. **Header-auth hardening:** Optional test header authentication now requires `NODE_ENV=development`, a missing or development-only `DEPLOYMENT_ENV`, explicit `ALLOW_HEADER_AUTH=true`, and a loopback peer address. API boot fails if staging or production attempts to enable header auth even with the wrong `NODE_ENV`.
4. Added 10 dependency-free security regression tests (`scripts/p0-global-role-privileges.test.mjs`) and updated the existing tenant-header release gate.

## Checks executed for this checkpoint

- `npm run test:offline` — **637/637 passed**.
- `node scripts/verify-release-static.mjs` — **8/8 groups passed**.
- `node scripts/verify-migration-chain.mjs` — **19 migration definitions checked**.
- `node scripts/rc1-release-gate.mjs` — **9/9 preflight checks passed**.
- `bash -n infra/bootstrap-db.sh` — passed.
- ZIP archive CRC/integrity — passed.

**NOT executed:** application build/typecheck (pnpm dependencies unavailable), PostgreSQL permission checks, migrated tenant data, live session tests, Stripe payment, staging deployment. Source tests cannot prove live database privileges.

## Operational notes

- On an **existing database**, run the administrative RLS policy script again **before restarting the application**, then execute `assert-global-role-privileges.sql`. This change is policy/grant-based; there is **no new numbered schema migration**.
- CI and `infra/bootstrap-db.sh` enforce the new PostgreSQL privilege checks. If the app's customer-account lifecycle later needs updating a profile or resetting a password, implement a separate reviewed, purpose-bound path; do **not** restore blanket users-table UPDATE.
- Database seeding is administrative by design and uses `DATABASE_URL_ADMIN`, not the restricted application role. Never run destructive demo seeding against customer data.
- The global `users` table remains readable by `pmo_app` for authentication. RLS protects tenant-scoped tables; the global accounts table does not have a tenant ID. A dedicated auth-service database role would offer stronger isolation in a later architecture/security review.
- For production launch, verify the effective grants directly on PostgreSQL as part of CI/staging, and run authenticated two-tenant API isolation tests with real sessions.

**Status:** P0 Checkpoint 5 source fix and offline checks completed; live PostgreSQL enforcement and broader authorization audit remain open.

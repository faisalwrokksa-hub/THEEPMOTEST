# Phase 12 — Super Admin subscriptions milestone

## Implemented in this package

- Vendor-only NestJS endpoints under `/api/v1/super-admin`:
  - `GET /plans`, `POST /plans`, `PATCH /plans/:code`, `GET /audit` (vendor plan audit history)
  - `GET /tenants?limit=25&offset=0` (max 50 per page)
  - `GET /tenants/:tenantId/subscriptions` (last 100 records)
  - `POST /tenants/:tenantId/subscriptions` — **manual grant**
  - `POST /tenants/:tenantId/subscriptions/:subscriptionId/cancel` — immediate revocation
- Every route checks the authenticated `pmoa_platform` capability **and re-reads** the user flag `users.is_platform_admin` from the database.
- Per-tenant reads/mutations go through `withTenant()` so transaction-local `app.tenant_id` enables RLS; tenant ID and subscription ID path parameters are UUID-validated.
- Manual grants have bounded validated dates, a mandatory human reason, and explicitly record `paymentVerified: false`. Existing subscriptions are canceled, not deleted. Grant and cancellation acquire the same tenant-scoped advisory transaction lock to limit races.
- Subscription events are inserted in the same transaction as grants and cancellations; plan creation and metadata edits use a separate append-only global audit journal.
- New vendor management web page `/super-admin` with plan catalog, plan activation, customer subscription summaries, manual grants, and cancellation forms. Browser POST proxy checks origin and forwards only allowlisted actions and validated IDs.
- Database migration `0013_platform_subscription_audit.sql`, schema definition, append-only grant/revoke policy, and added missing SQL migration references in Drizzle's `_journal.json` for fresh installs.

## Schema / security decisions

- Plan pricing and billing interval are immutable after creation; create a **new plan code** for price changes so historical references are not silently repriced. Plan PATCH only updates `name`/`isActive`.
- `subscription_plans.is_active = false` blocks **new grants** on that plan; it does **not** revoke customers' existing subscriptions.
- A manual license grant does **not** charge a customer and does **not** constitute payment confirmation. Renewal payment validation and provider integration are not part of this milestone.
- Subscription validity does **not** automatically enable optional tenant modules: the existing module-entitlement workflow remains separate.
- Platform-admin users need membership in at least one workspace to acquire an authenticated session, consistent with the existing application model. Once signed in, the vendor flag allows their Super Admin APIs to manage other tenants without switching sessions.
- The `pmo_app` database account cannot update `tenants` and should not bypass RLS; use `withTenant`, not an admin database URL, for customer subscription operations.

## Verification carried out

```
node --test tests/super-admin-source.test.mjs packages/db/src/subscription-lifecycle.test.mjs packages/db/src/subscription-transitions.test.mjs
```

Result: **32 tests passed** (21 lifecycle and transition tests + 11 dependency-free source architecture checks). TypeScript syntax was checked using the TypeScript compiler parser for nine modified `.ts`/`.tsx` files. Source checks confirm patterns in the code; they are **not HTTP, cross-tenant or real PostgreSQL integration tests**.

## Deployment blockers / manual verification before production

1. **Apply SQL migrations with admin credentials**, including `0011`, `0012`, and new `0013`. The documented server bootstrap path is `infra/bootstrap-db.sh` (which records executed SQL scripts). Snapshot/restore the database and verify any existing migration ledger before running. The Drizzle journal was synced for fresh installs; do not combine two migration runners on a partially provisioned database without reconciliation.
2. Re-run `packages/db/sql/rls.sql` as administrator **after** the new table has been created so the application role can INSERT audit rows but cannot UPDATE/DELETE them.
3. Install pinned monorepo dependencies with pnpm and run both NestJS and Next.js typechecks/builds. Dependencies were **not installed** in this environment, so a full build is not claimed.
4. Run HTTP integration tests as a real vendor admin, a normal tenant owner, a nonmember, and a revoked vendor admin; confirm that no unauthorized tenant/plan data is exposed and cancellation is immediately enforced in `ModuleGuard`.
5. Exercise concurrency tests for duplicate grant requests and simultaneous grants/cancellations on a real PostgreSQL deployment.
6. Connect a payment provider with signed payment confirmation and idempotent webhooks before offering automatic paid renewals. Implement additional tenant-module assignment controls if required by your product plans.

**Status:** Functional source milestone with automated static/pure-rule checks, **not a production-ready billing system**.

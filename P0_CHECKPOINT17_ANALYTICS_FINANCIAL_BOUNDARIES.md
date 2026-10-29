# The EPMO — P0 Checkpoint 17: tenant-scoped analytics capture and detailed financial access

**Baseline:** `the-epmo-p0-update-authorization-checkpoint16.zip`.

## Confirmed source risks and remediation

1. `POST /api/v1/trends/capture` was workspace-admin gated, but invoked `TrendsService.capture()` which enumerated and updated **every tenant's** portfolio snapshot. Any licensed tenant administrator could therefore cause database writes across other tenants. The endpoint now calls `captureTenant(currentContext().tenantId)`, returning one captured workspace, while scheduled and startup jobs retain the separate system-wide `capture()` implementation. The tenant-scoped capture uses `withTenant(tenantId, ...)` and writes one snapshot keyed to that tenant.
2. `GET /api/v1/financials` and `/api/v1/benefits` enforced purchased module entitlements but did not require `pmoa_view_financials`. A signed-in user who lacked detailed finance viewing permission could call the URLs directly if the tenant licensed the module. Both routes now require `pmoa_view_financials` before performing the service query, matching the web navigation capability.
3. Ten new source-level security assertions cover manual/system capture separation, finance/benefit capability enforcement, and the presence of live-test cases.
4. Added live Vitest test cases for capture scoping, non-admin capture refusal, finance denial to a team member, and permitted finance views for the finance role. They are **not executed** without a running API and PostgreSQL.

## Local verification

- `npm run test:offline`: **762/762 passed**.
- `node --experimental-strip-types --test tests/p0-tenant-analytics-boundary.test.mjs`: **10/10 passed**.
- `node scripts/verify-release-static.mjs`: **8/8 release groups passed**.
- `node scripts/rc1-release-gate.mjs`: **9/9 preflight checks passed**.
- `node scripts/verify-migration-chain.mjs`: **20/20 migration files validated**; no new migration in this checkpoint.
- TypeScript syntax parsing for four changed source/test files passed. This is not a dependency-backed typecheck or build.
- ZIP CRC checked after packaging.

## Explicit limitations and launch blockers

- These guards cover the **detailed financials and benefits endpoints**. Other portfolio/overview/analytics/AI endpoints may contain financial aggregates and require a dedicated authorization/data-minimization review. Do not infer that *all* finance-related data is restricted by this patch.
- No real API/PostgreSQL RLS/role isolation tests, TypeScript package build, SES delivery, Stripe checkout/webhook test, running Docker images or browser acceptance tests have been completed here.
- The connected GitHub account currently exposes zero repositories. The source must be placed in an accessible private repository before the required CI build and database tests can run. Do not approve paid launch from offline checks alone.

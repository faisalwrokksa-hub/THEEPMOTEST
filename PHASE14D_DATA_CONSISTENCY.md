# The EPMO — Phase 14D: data consistency and retry recovery

## Changes

1. `apps/api/src/governance/gate-writes.service.ts`
   - Gate-level PostgreSQL row locks serialize criterion changes, approval decisions, approver assignments, gate criteria additions, blocker status changes, and gate advancements.
   - Advance operations acquire the project row before the gate row, sharing the order used by workbook updates. Readiness is re-evaluated after the gate lock. Audit remains in the same tenant-scoped transaction.
   - Repeated identical criterion/evidence or task-state submissions do not rewrite timestamps or duplicate audit events.
2. `apps/api/src/creates/creates.service.ts`
   - Creating RAID items that block an active gate locks the project then the active gate, and rejects the request if there is no active gate.
3. `apps/api/src/excel/excel.service.ts`
   - Workbook updates lock the project's gates in sequence before updating criteria or register items; newly imported criteria cannot silently modify previously approved stage gates.
4. `tests/phase14d-gate-consistency.test.mjs`
   - Adds 12 **source-contract checks** for lock ordering and no-op retries. These are not database concurrency tests.
5. `tests/gate-writes.test.ts`
   - Adds a **PostgreSQL/API integration test** that races two gate-advance requests, expects exactly one success and one conflict, and checks the audit row count. This integration test could not be executed in the offline environment.

## Verified in this package

- `node --experimental-strip-types --test apps/api/src/platform/*.test.mjs apps/api/src/onboarding/*.test.mjs apps/api/src/creates/*.test.mjs apps/web/src/lib/*.test.mjs packages/db/src/*.test.mjs scripts/*.test.mjs tests/*.test.mjs`: **399/399 passed** (including 12 new source-contract checks).
- `node scripts/verify-release-static.mjs`: **8/8 groups passed**.
- `node scripts/verify-migration-chain.mjs`: **18 ordered SQL migrations matched** (no new migration needed).
- TypeScript parser: all four changed `.ts` files parsed without syntax errors.
- ZIP archive: passed integrity check.

## Not yet verified — release blockers

- Run full dependency-backed Next.js/NestJS build and typecheck.
- Apply migrations on staging PostgreSQL and execute `tests/gate-writes.test.ts`, including its new simultaneous advance test.
- Execute cross-tenant security, browser accessibility, SES delivery, and Stripe test-mode acceptance tests before production deployment.

This is a source-level QA milestone, **not a production-ready release**. Phase 12 staging checks remain deferred.

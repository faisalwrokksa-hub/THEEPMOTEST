# The EPMO — Phase 14F: Source Quality and Regression Review

## Baseline
- Source archive: `the-epmo-phase14e-security-audit.zip`.
- Baseline offline suite: 408/408 passed.

## Fixes delivered

### 1. Atomic account lockout counters
`apps/api/src/auth/auth.service.ts`

Before: failed login handling computed `failedAttempts + 1` from an earlier read, then wrote that value. Simultaneous invalid sign-ins could overwrite each other's counts.

Now: an atomic PostgreSQL `UPDATE` increments the counter in the database, locks after `MAX_FAILED`, and resets the count when a prior timed lock has expired. The existing login rules (disabled accounts, password check, active membership) remain in place.

**Validation limit:** the new regression tests inspect the source code, SQL statement structure, and ordering. Actual concurrent requests and transaction semantics **must** be exercised against staging PostgreSQL.

### 2. Invitation recovery after thrown email errors
`apps/api/src/onboarding/onboarding.service.ts`

Before: SES and the mail abstraction generally return `{ok:false}` on failure, but an unexpected rejected promise left a saved invitation with `delivery_status='pending'`. Reissuing that invitation was blocked until it expired or was manually revoked.

Now: rejected sends take the same failure path as ordinary delivery failures. The invitation is marked failed and revoked before a sanitized service-unavailable error is returned. No invitation URL is exposed in API responses.

**Validation limit:** SES delivery, PostgreSQL RLS, and live token invalidation are not tested in this environment.

## Local checks
- `npm run test:offline`: **415 / 415 passed** (includes 7 Phase 14F regression checks).
- `npm run verify:static`: **8 / 8 groups passed**.
- `npm run verify:migrations`: **18 / 18 ordered SQL migration files consistent**.
- Changed TypeScript files: **2 / 2 syntax transpilation checks passed**.
- ZIP archive integrity: check result recorded at packaging.

## Outstanding blockers — NOT production-verified
1. Full pnpm/Next.js/NestJS build with installed dependencies and TypeScript typechecking.
2. Real PostgreSQL migrations and row-level tenant isolation.
3. Concurrent failed sign-ins and single-use invitation acceptance with a real database.
4. SES invitation delivery in staging, including provider exceptions and reissuance.
5. Stripe test-mode payment, verified webhook, renewal, and replay protection.
6. Browser-based Arabic/English accessibility, critical workflows, and production deployment.

## Recommended staging acceptance examples
- Send 5 concurrent incorrect passwords for one account; verify the atomic counter and lockout.
- Wait until account unlock; one failed attempt should restart the counter rather than immediately re-locking.
- Simulate a mail transport that throws; verify invitation is marked failed/revoked and can be safely reissued.
- Verify an already sent token can be redeemed exactly once and never joins the wrong tenant.
- Run full build, migrations, security and payment workflows before declaring a production release.

No new database migration is required by this milestone. The existing deferred Phase 12 live-staging acceptance tasks remain open.

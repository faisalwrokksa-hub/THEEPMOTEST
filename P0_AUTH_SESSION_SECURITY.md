# The EPMO — P0 authentication and session-security checkpoint 2

## Confirmed source fixes

1. `apps/api/src/auth/auth.service.ts`: replace the malformed dummy bcrypt digest with a valid precomputed cost-12 bcrypt digest for unknown user identifiers. A malformed digest can return prematurely and make timing-based account enumeration easier. Verified the digest using Apache `htpasswd` locally, in addition to source regression assertions.
2. Use one public invalid-credentials response for unknown users, wrong passwords, locked users, and accounts with no active workspace; preserve differentiated security events for operators.
3. Permanently revoke the *current session row* when the account is disabled or its active workspace membership is revoked. Re-enabling an account or membership must require a new sign-in; a previously issued cookie must not revive.
4. `apps/api/src/common/write-origin.guard.ts`: reject browser mutations with a `Sec-Fetch-Site` value that is not `same-origin` when `Origin` is absent. Explicitly authorized origin requests and origin-less internal proxy requests remain supported.
5. Added `tests/p0-auth-session-security.test.mjs` with 12 focused regression tests.

## Verification in this environment

- Offline suite: **606/606 passed** (`npm run test:offline`).
- Focused P0 tests: **12/12 passed** (`node --experimental-strip-types --test tests/p0-auth-session-security.test.mjs`).
- Static release checks: **8/8 passed** (`node scripts/verify-release-static.mjs`).
- Migration chain: **18/18 files passed** (`node scripts/verify-migration-chain.mjs`).
- Node TypeScript syntax check passed for `auth.service.ts` and `write-origin.guard.ts`.
- The compiled application was **not** built; project dependencies are not installed in this environment.
- Runtime auth response timing, race conditions, real session storage, and cross-organization security have **not** been exercised against a running API and PostgreSQL.

## Remaining P0 launch checks

- Run authenticated API/PostgreSQL security tests against staging.
- Review payment gateway, webhooks, renewals, refunds and billing failure paths.
- Verify invitation email delivery, account activation, credential recovery and multi-tenant authorization in staging.
- Audit production secrets and demo seed safeguards, application logs and error-reporting configuration.
- Execute full build, database migrations, browser CSRF and session-regression tests.

Do not interpret offline checks as production approval.

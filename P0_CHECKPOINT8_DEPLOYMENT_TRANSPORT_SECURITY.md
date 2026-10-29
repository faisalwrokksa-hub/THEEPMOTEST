# The EPMO — P0 Checkpoint 8: HTTPS Session and Deployment Identity

## Finding and fix

Before this checkpoint, session cookie `Secure`, the HTTPS-only web-origin check,
and Stripe checkout return-URL validation relied on `NODE_ENV=production`.
Deploying with `DEPLOYMENT_ENV=staging` or `production` but an accidentally
incorrect `NODE_ENV` could therefore result in a non-secure session cookie
and acceptance of an HTTP browser origin.

- Introduced `apps/api/src/common/deployment-policy.ts` with the pure
  `requiresSecureTransport(nodeEnv, deploymentEnv)` rule.
- Auth session cookies now use that rule (HTTPS-only in staging or production).
- API startup rejects HTTP `WEB_ORIGIN` in these deployments and validates
  `DEPLOYMENT_ENV` against `development`, `staging`, or `production`.
- Stripe Checkout redirect validation uses the same transport rule.
- Test/reference payment simulator and production-grade login/session limits
  apply to deployed environments even when `NODE_ENV` is misconfigured.
- Updated the static production-configuration check to assert the new rule.

## Verification

Run from the repository root:

```sh
npm run test:offline
node scripts/verify-release-static.mjs
node scripts/verify-migration-chain.mjs
node --experimental-strip-types --test tests/p0-deployment-transport.test.mjs
```

All 10 targeted security tests passed. The full offline test suite passed 678/678;
8/8 static release-check groups passed and 19/19 SQL migrations matched the
journal and checksum manifest. Source syntax checks are not a full build.

## Production-readiness status

**Not approved for live paying customers.** The dependency-backed API/web build,
real PostgreSQL permissions and tenant-isolation verification, Stripe payments,
SES delivery, staging/browser tests, secure hosting, backup/restore rehearsal,
and commercial policies are still pending.

`DEPLOYMENT_ENV=staging` with test-mode Stripe requires the existing explicit
staging exception, a valid TLS web origin, and configured staging secrets.
Use secure configuration management; never commit secret keys.

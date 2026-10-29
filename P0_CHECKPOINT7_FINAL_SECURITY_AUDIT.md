# The EPMO — P0 Checkpoint 7: Authorization Review and Launch Blockers

## Baseline
This update is based on `the-epmo-p0-secrets-logging-checkpoint6.zip`.

## Source changes

1. **Notification outbox authorization** — The `/api/v1/notifications` GET endpoint returns recipient email addresses, subjects, and delivery failure details. Previously, any authenticated workspace member could read these details. The endpoint now requires the `pmoa_admin` capability, matching the existing rule-run endpoint. The navigation capability for Notifications is also `pmoa_admin`.
2. **Bounded notification list query** — `limit` is now a safe integer between 1 and 500, instead of accepting negative/non-finite values and forwarding them to SQL.
3. **Microsoft OAuth callback redirect** — A caller-provided `returnTo` path was stored during authorization. A string such as `//malicious.example` could be interpreted as a protocol-relative redirect by `new URL(...)`. Both state creation and callback now normalize to an allowlisted local `/integrations` path (optionally with query or fragment), preventing cross-origin redirects.
4. **Regression tests** — 16 new focused offline tests cover authorization wiring, outbox limits, and OAuth return-path validation. The existing live notification test now verifies a non-admin receives 401/403 on outbox reads; it cannot execute until an API/PostgreSQL test environment is available.

## Checks actually run in this workspace

| Check | Observed result |
|---|---|
| `npm run test:offline` | 668/668 passed |
| `node scripts/verify-release-static.mjs` | 8/8 groups passed |
| `node scripts/verify-migration-chain.mjs` | 19 migration files consistent |
| TypeScript syntax/transpilation of 6 changed TS files | 6/6 passed (syntax only) |
| Archive `ZipFile.testzip()` | Passed |

These checks do **not** prove a dependency-backed TypeScript build, correct runtime SQL privileges, penetration-test results, or actual Microsoft/Stripe callback behavior.

## Outstanding blockers to taking payment from customers

**P0: required before accepting paying customers**

- Full dependency-backed `pnpm` build of both Next.js and NestJS apps, production container build, and runtime smoke tests.
- Deploy and execute all 19 SQL migrations on PostgreSQL, validate migration permissions and forced tenant RLS, run authenticated tenant-isolation and concurrency tests.
- Run live webhook/Checkout test-mode end-to-end checks including duplicate deliveries, refunds/disputes, invoice matching, and license transitions. Verify that the selected payment provider can legally onboard the operating business and settle to its bank account.
- Verify SES invitation, password recovery (if implemented), account activation, and sign-out behavior in a real browser, with correct mail delivery and expiry/replay handling.
- Test Arabic and English sign-up, onboarding, billing, authorization, accessibility, and critical user workflows in real browsers.
- Exercise backup + restore on isolated staging PostgreSQL; confirm monitoring, alerting, HTTPS, cookie settings, incident escalation, and operational recovery.
- Review commercial/legal setup, invoice/tax obligations, cancellation/refund policy, terms, privacy notice, and a customer support contact. Professional/local legal and tax review may be necessary.

**Evidence status:** Production readiness is **not approved**. There is no live build, running PostgreSQL validation, Stripe test payment, SES delivery, or deployed browser acceptance evidence in this session.

**Recommended next action:** Put this package in a private GitHub repository with Actions or a configured staging server, then execute the existing build/security/Stripe acceptance gates; fix runtime failures before adding more source-only features.

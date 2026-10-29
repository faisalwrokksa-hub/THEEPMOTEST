# The EPMO — P0 Security Checkpoint 1

**Baseline:** Phase 17D (`the-epmo-phase17d-first-staging-bootstrap.zip`).
**Scope:** Pre-hosting, source-level account enrollment and information-disclosure hardening.
**Production status:** NOT APPROVED. Live build, PostgreSQL/RLS, Stripe, SES and browser tests remain outstanding.

## Confirmed findings and fixes

### P0-01 — Direct membership enrollment bypassed mailbox confirmation

- Previous endpoint: `POST /api/v1/create/member`.
- Before: a workspace administrator could create a user with an administrator-supplied password or attach an existing global user account to a workspace by email without that account accepting an invitation.
- After: the controller returns HTTP **410 Gone**. No password is accepted/processed by this route; the direct member-creation service was removed.
- Supported replacement: `POST /api/v1/onboarding/invitations`, followed by `POST /api/v1/onboarding/invitation/accept`. This flow uses a hashed, single-use, expiring emailed token and tenant-scoped acceptance. Email transport must be configured for actual delivery.
- Migration impact: legacy automation calling the direct member endpoint **must migrate** to invitations. Password-based direct onboarding has intentionally been retired. Membership role changes for existing members remain supported.

### P0-02 — Development identity list presented unnecessary PII exposure risk

- Previous route: unauthenticated `GET /dev/identities` (guarded by `NODE_ENV !== 'production'`). It disclosed user emails, display names and workspace membership in nonproduction modes.
- After: `DevController` is not registered and its source file has been removed. The endpoint is unavailable in all modes.
- Migration impact: developers should use authenticated APIs or locally generated test fixtures instead of the public identity index.

## Local verification performed

- `npm run test:offline`: **594/594 passed**, including 7 new targeted source checks.
- `node scripts/verify-release-static.mjs`: **8/8 release groups passed**.
- `node scripts/verify-migration-chain.mjs`: **18 migrations verified**.
- ZIP integrity checked with Python `zipfile.testzip()` after packaging.
- No database schema changes in this checkpoint.

## What remains before accepting paying customers

1. Continue P0 audit: session/CORS/CSRF, webhook billing edge cases, cross-tenant DB permissions, security headers and secrets.
2. Execute dependency-backed TypeScript/Next.js builds and check production artifacts.
3. Run all SQL migrations and real RLS/tenant-isolation tests against staging PostgreSQL.
4. Verify payment processing, webhook retries and license renewal with a permitted PSP, plus SES email delivery.
5. Confirm bilingual journeys, restore rehearsal, monitoring and legal/commercial readiness in staging.

**Local environment limits:** pnpm, Docker and PostgreSQL clients unavailable. New tests are source-level guard checks, not a live HTTP penetration test. Do not describe this checkpoint as production-certified.

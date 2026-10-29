# The EPMO — P0 Checkpoint 16: Read-only role / update-posting security

**Baseline:** `the-epmo-p0-production-docker-ci-checkpoint15.zip`.

## Confirmed issue and remediation

`POST /api/v1/create/update` previously required only `read` while inserting a new tenant update and audit event. Users assigned `executive_viewer`, `viewer`, or `restricted_viewer` could therefore publish status notes and escalations despite their read-only role.

**Fixed:** Introduced explicit capability `pmoa_post_updates`, enforced by the server-side `CreatesService.update` handler. Workspace owners/admins, project/program/portfolio staff, governance and finance contributors, consultants and team members retain write access. Reader-only roles do not receive it. The `GET /api/v1/updates` feed stays readable by authenticated members; the bilingual update page hides the composer for users without the new capability and explains why. Workspace Settings describes the capability.

**No schema migration** is required. Capabilities are derived from the user's membership role on each request, not stored as a separate durable user grant. Frontend affordance is supplemental; the backend check is the authorization boundary.

## Local tests completed

- `npm run test:offline`: **752/752 passed**, including **10 new source-level authorization checks**.
- `node scripts/verify-release-static.mjs`: **8/8 groups passed**.
- `node scripts/verify-migration-chain.mjs`: **20 migration definitions verified**.
- TypeScript/TSX parser syntax checks on changed source files: passed.
- GitHub Actions YAML parse: passed.
- ZIP testzip integrity: passed after packaging.

## CI / live acceptance required

`tests/update-write-authorization.test.ts` is registered as an explicitly opted-in GitHub CI job, after disposable database seeding and with a running NestJS API. It checks:

1. An `executive_viewer` can GET updates but is denied POST (HTTP 403).
2. A `staff_consultant` can POST a valid update (HTTP 201).
3. Anonymous update posting is rejected (HTTP 401).

**Not run here:** the live test, the dependency-backed API/Next.js builds, Docker, or PostgreSQL tests. Connected GitHub currently lists zero accessible repositories. The source-only security result is not production approval.

## Remaining launch blockers

Connect a private GitHub repository and run the entire CI workflow, then fix runtime build/database failures. Execute Stripe/provider tests, SES email delivery, bilingual browser acceptance, tenant RLS and operational readiness checks on staging. Confirm business registration/payment provider suitability before charging customers.

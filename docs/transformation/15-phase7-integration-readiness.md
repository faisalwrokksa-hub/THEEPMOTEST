# Phase 7 — Integration readiness and authentication coverage

## Changes
- Added three authentication integration tests: reject cross-site mutations; reject unapproved `Origin` without Fetch Metadata; accept an internal authenticated logout and verify token revocation.
- Added two tenant-switch validation tests: reject unauthenticated switches and reject malformed tenant IDs.
- Hardened the CI API startup step: now fails if the API exits prematurely or never responds successfully to `/health`; prints API logs on failure.

## Verification run (2026-10-25)
- `node scripts/verify-release-static.mjs`: PASS, all 6 groups.
- Full Vitest integration suite: NOT RUN (requires dependencies, live API and seeded PostgreSQL).
- Browser-based Arabic/English UI: NOT RUN (requires running web app/browser).
- Live RLS and security testing: NOT RUN (requires seeded database).

## How to validate in a configured environment
1. Install pnpm 10.17.0 and dependencies: `pnpm install --frozen-lockfile`.
2. Provision isolated local PostgreSQL and Redis; configure test-only `.env` values.
3. Run the documented database setup/seed flow; do not point tests at production.
4. Run `pnpm verify:static`, `pnpm typecheck`, `pnpm verify:rls`, and `pnpm test`.
5. Build both applications and validate Arabic RTL and English LTR pages in a browser.
6. Review the CI workflow results. Do not treat static checks as runtime certification.

## Known boundaries
- The origin guard is not a complete CSRF-token solution, especially for requests lacking browser provenance headers.
- Existing compatibility references (including old demo login credentials) are deliberately retained.
- Passing an endpoint inventory or static security check is not proof of tenant separation; runtime checks remain essential.

## Release recommendation
Do not certify or deploy to production until the full builds, runtime tests, tenant isolation verification and browser testing pass in a controlled environment.

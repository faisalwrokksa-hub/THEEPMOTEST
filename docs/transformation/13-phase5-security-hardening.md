# Phase 5 — API Request Provenance and Security Review

## Verified changes
- Introduced `apps/api/src/common/write-origin.guard.ts` to evaluate the provenance of HTTP write requests.
- Wired it into `apps/api/src/main.ts` before controllers, rejecting cross-site browser write requests (`Sec-Fetch-Site: cross-site`) and requests with an explicitly disallowed `Origin` header.
- Reused the previously validated `WEB_ORIGIN` allowlist; empty and wildcard values remain rejected at bootstrap.
- Preserved Next.js internal API proxy compatibility: requests with neither browser provenance header remain allowed, and still require normal auth/authorization.
- Added reproducible unit assertions in `scripts/verify-write-origin.mjs`.

## Threat assessment: confirmed design issue
Before this change, CORS rules controlled cross-origin response access but did not expressly reject cross-site state-changing browser requests. SameSite=Lax cookies reduce CSRF exposure, but relying only on browser cookie policy and CORS is an incomplete write-request defense. This change adds defense in depth without changing the session model.

## Tradeoffs and residual risk
- Header provenance is **not a complete anti-CSRF token design**. Non-browser/server requests can omit or forge these headers; they must still authenticate and authorize. Some unusual older browser requests may omit both and be allowed. A future iteration should implement robust CSRF tokens (or a strict trusted-origin policy with an explicit internal-server credential strategy).
- Origin checks apply to all non-safe methods, including login. Explicitly authorized browser origins remain supported.
- No database, migration, tenant isolation or permission logic was modified. Existing RLS and role checks still need integration verification.
- Security findings are based on source review; there is no claim of a complete penetration test.

## Verification executed
- `node --experimental-strip-types scripts/verify-write-origin.mjs`: 8/8 passed.
- `node scripts/dict.mjs`: 774 entries, no duplicates.
- `node scripts/shadow.mjs`: passed.
- `node scripts/verify-bilingual-brand.mjs`: 10/10 passed.
- `node scripts/verify-production-config.mjs`: 7/7 passed.
- `node scripts/brand-audit.mjs`: 0 unclassified old-brand hits; 25 compatibility references retained.

## Not verified
- Full NestJS/Next.js TypeScript build and application runtime: dependencies are not installed in this environment.
- Database-backed authentication, membership checks, RLS and tenant isolation.
- Browser-level CSRF behavior, Arabic RTL screenshot review, and actual integrations.

## Required production gates
1. Install the locked pnpm dependencies in CI.
2. Run `pnpm verify`, `pnpm build` and the service/database integration tests.
3. Run browser E2E tests from allowed and disallowed origins, including authenticated cookie writes and Next.js proxy routes.
4. Verify authenticated tenant switching cannot access other tenant resources.
5. Review reverse proxy settings, authorization hooks, session revocation, CSP and deployment secrets.
6. Roll out behind controlled deployment and retain a rollback archive.

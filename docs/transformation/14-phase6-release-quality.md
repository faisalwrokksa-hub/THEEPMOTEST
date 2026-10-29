# Phase 6 — Repeatable release checks and authorization inventory

## Implemented
- Added `scripts/verify-release-static.mjs`, a Node 22 runner of six existing static checks with nonzero exit on failure.
- Added root `verify:static` package script and independent `source-guards` CI job running without pnpm dependencies.
- Pinned CI pnpm to `10.17.0` to match packageManager.
- Added read-only `scripts/authorization-inventory.mjs` for route-level review.

## Confirmed observations
- Static checks: **6/6 groups passed** (translations, shadowing, bilingual branding, production config, request provenance, brand scan).
- Brand audit: **0 unclassified matches**, 25 retained compatibility-reference lines.
- Inventory: **14 controllers, 87 route decorators**. This does not establish authorization defects: most permission checks are in services and middleware.
- Sample review: `PlatformService.setModule()` performs a capability check; `AuthService.switchTenant()` verifies membership.

## Still not verified
- Full pnpm install, TypeScript compilation, database-backed RLS, integration tests and browser RTL/CSRF tests. Run network-enabled CI with PostgreSQL and Redis.
- Complete route-by-route authorization verification and production Content Security Policy rollout.
- No production deployment or database changes performed. **Not production-certified**.

## Commands
```bash
node scripts/verify-release-static.mjs
node scripts/authorization-inventory.mjs
pnpm install --frozen-lockfile
pnpm verify
pnpm build
```

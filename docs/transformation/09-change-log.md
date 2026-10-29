# Change Log — Initial Rebranding Pass

- Updated visible `Align360` product references within web and API source to `The EPMO`.
- Added Arabic official brand display for app navigation and login.
- Updated shared Arabic dictionary's translated product references and registered the canonical `The EPMO` key.
- Updated application metadata, web icon, export author metadata and filenames, email footer and assistant system branding.
- Renamed root package manifest display identifier to `the-epmo`, kept internal package namespaces unchanged.
- Updated seed account display name only; left demo login identifiers intact.
- Added this audit and follow-up plan.

**Limits:** No production deployment; no committed external service migration; no end-to-end validation. Archive represents an initial implementation, not a certified completed production migration.

## Validation follow-up
See `10-validation-report.md` for dependency-free checks, updated audit scope, and unresolved runtime verification.

## Phase 6
- Added static release gate, CI source-guards job, exact pnpm version, and read-only authorization inventory. See `14-phase6-release-quality.md`.

## Phase 7 — Integration readiness
Added five authentication and tenant-boundary integration tests and a fail-fast API health gate in CI. See `15-phase7-integration-readiness.md`. Runtime validation remains pending.

## Phase 8
- Made SQL-backed test helper work with CI PostgreSQL service using DATABASE_URL_ADMIN and fail-fast psql.
- Installed PostgreSQL client in CI and removed hardcoded API origin from tenant switching tests.
- Added 16-phase8-stabilization.md.

## Phase 9 — Browser mutation and redirect protection
- Protected all mutating Next.js route handlers that forward session cookies using explicit browser request-origin checks.
- Added a dependency-free web boundary test gate covering origin enforcement, path safety, redirects, and mutating route coverage.
- Made external redirect origins allowlist-based in production, preventing Host / X-Forwarded-Host response poisoning.
- Limited form `returnTo` redirects to application-local paths and passed `WEB_ORIGIN` to the production web container.
- Full application runtime tests still require dependencies and provisioned services; see `17-phase9-browser-boundary.md`.

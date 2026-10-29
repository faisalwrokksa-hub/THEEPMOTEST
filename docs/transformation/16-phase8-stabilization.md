# Phase 8 — Application stabilization and integration test portability

## Confirmed issue fixed

The integration-test `psql()` helper previously always ran SQL using `docker exec pmo-postgres`. In GitHub Actions the PostgreSQL database is provisioned as a service, without a named container accessible to Docker commands. This prevented SQL-backed tests from running in CI.

The helper now uses `DATABASE_URL_ADMIN` and a local `psql` CLI when configured, with the existing named Docker container as a fallback for developer machines. The CI workflow installs `postgresql-client`. Invalid SQL now fails immediately (`ON_ERROR_STOP=1`). Tenant-switching tests use `TEST_API` via the shared `API` constant instead of a fixed localhost URL.

## Completed verification

- `node scripts/verify-release-static.mjs`: all six groups passed.
- ZIP source integrity: checked at packaging time.
- Reviewed CI PostgreSQL configuration and test helper wiring.

## Not verified

- `pnpm install`, `pnpm typecheck`, application build and integration tests: package dependencies are not installed and registry DNS resolution remains unavailable in this environment.
- PostgreSQL tenant isolation at runtime, login/logout integration, browser RTL rendering and report generation: require working services.

## Next validation in connected CI

1. Run the GitHub Actions `verify` job with PostgreSQL and Redis services.
2. Confirm `pnpm test` executes all SQL-backed test files, and address any actual failures.
3. Run browser route traversal for English and Arabic using `pnpm pages` against a seeded deployment.
4. Capture any remaining application exceptions and keep release blocked until resolved.

No live environment, production secret, or customer database was modified.

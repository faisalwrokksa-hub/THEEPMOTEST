# The EPMO — Checkpoint 29: CI Safety Invariant Gate

## Change
- Added dependency-free `scripts/verify-ci-safety.mjs`, guarding 15 safety properties of the GitHub Actions workflow.
- Added four regression tests, including removal of RLS checks, current-run evidence validation, or read-only GitHub permissions.
- Wired the gate into the `source-guards` job before the other CI source checks.
- Preserved Checkpoint 28 application logic, migrations and previous M2-M5 changes.

## Evidence (2026-10-29)
- `npm run test:offline`: 824 passed / 0 failed / 0 skipped (see OFFLINE_TEST_LOG.txt).
- `node scripts/verify-release-static.mjs`: passed (STATIC_LOG.txt).
- `node scripts/verify-migration-chain.mjs`: passed (MIGRATION_LOG.txt).
- `node scripts/verify-ci-safety.mjs`: 15/15 safety checks passed (CI_SAFETY_LOG.txt).

## Boundaries
The CI safety gate checks workflow content only and cannot prove that GitHub ran it. The workflow tests require a connected EPMO repository and functional remote CI. Full dependency-backed builds, live multi-tenant PostgreSQL tests, Stripe billing, Microsoft per-user authorization, staging browser acceptance, and backup/restore rehearsal in a target environment are still unverified. No production deployment occurred.

## Commercial determination
NO-GO for paying customers. All six P0 acceptance families remain open pending external execution and evidence. Do not equate 824 passing offline tests with a production certification.

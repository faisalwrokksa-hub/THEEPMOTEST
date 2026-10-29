# The EPMO — P0 Checkpoint 14: CI PostgreSQL Restore Verification

Baseline: `the-epmo-p0-destructive-seed-safety-checkpoint13.zip`.

## Changes made

1. Added `scripts/verify-ci-database-restore.mjs` and a new **PostgreSQL restore rehearsal** step to the `verify` job in GitHub Actions. After the 20 migrations and disposable demo seed, CI backs up the local database in PostgreSQL custom format and restores it into an isolated, randomly named database. It verifies that the source and restored counts match across core tables, then removes the temporary database. The original `pmo` database is never dropped.
2. The rehearsal refuses to start unless GitHub Actions, `NODE_ENV=test`, explicit disposable-database acknowledgement, matching local admin/restricted URLs and port 5433 are present. Database names, URLs and port cannot be supplied as arbitrary arguments.
3. PostgreSQL commands use a deliberately small environment. Inherited `PGHOSTADDR`, service files, or other libpq variables cannot override the checked loopback host through inherited environment variables.
4. Added `db_restore` to mandatory same-run CI evidence gates, between the RLS/migration evidence and typecheck. Missing evidence fails the CI acceptance verification.
5. Added 10 security and evidence regression tests in `scripts/p0-ci-restore-safety.test.mjs` and updated the central CI coverage assertions.

## Checks executed locally

- `npm run test:offline`: **734/734 passed**.
- Focused CI restore safety tests: **10/10 passed**.
- `node scripts/verify-release-static.mjs`: **8/8 passed**.
- `node scripts/verify-migration-chain.mjs`: **20 migration definitions matched**.
- `node scripts/rc1-release-gate.mjs`: **9/9 passed**.
- Node syntax checks on both new scripts: passed.
- ZIP CRC/integrity: verified at packaging.

## Not executed (critical distinction)

**No PostgreSQL restore has run yet in this workspace.** There is no installed `psql`, `pg_dump`, `pg_restore`, Docker, or `pnpm` toolchain. The restore drill has been *implemented* and source-tested but awaits a real GitHub Actions runner or disposable staging PostgreSQL. No production launch approval can be inferred from these offline tests.

## Run on first connected GitHub repository

1. Push this source to a private GitHub repository.
2. In **Actions → CI → Run workflow**, run on the desired commit.
3. Confirm the `verify` job runs migrations/RLS, seeds disposable fixtures, performs `Restore seeded PostgreSQL into an isolated CI database`, records `db_restore`, then runs types and integration tests.
4. Read the job logs for both full-build and restore results; a successful restore log should report matched table counts and cleanup.
5. Investigate any failure; **do not** loosen the disposable-database guards or replace them with a check that merely lists a backup archive.

This CI restore exercise is separate from the already required staging backup/restore rehearsal on the deployment host. Complete both before accepting paying customers.

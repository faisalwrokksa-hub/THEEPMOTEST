# Phase 16B — Isolated staging database restore rehearsal

## Delivered

- Added `infra/rehearse-db-restore.sh`, a staging-only check that verifies a pre-migration custom-format PostgreSQL backup, creates a randomly named **separate database** inside the staging PostgreSQL container, restores the archive, verifies that the restored schema matches the pre-migration source (fresh database or existing installation), and drops the temporary database on success or failure.
- The script **refuses production mode** and requires `.env.staging` with `DEPLOYMENT_ENV=staging`. The temporary database is never `pmo` or the configured source database; a failed `createdb` never triggers a drop.
- Staging `infra/deploy.sh` now runs: remote prerequisites → sync → configuration preflight → build → start Postgres/Redis → verified backup → **restore rehearsal** → SQL migrations → API/web startup and health check.
- A failed restore or failed temporary-database cleanup halts staging deployment before SQL migrations. For production, deployment still creates a verified backup but does **not** perform an automatic rehearsal in the production environment. Use an isolated copy of production data and obtain separate approval before production rollout.
- Added `scripts/phase16b-restore-rehearsal.test.mjs` and regression assertions for the staging deploy order.

## On a securely configured staging host

1. Set `DEPLOYMENT_ENV=staging` in the server-owned `.env.staging` file, and ensure `PG_USER`, `PG_PASSWORD`, `PG_DB` and application DB configuration are set. Do not commit secrets.
2. Confirm Docker Compose, Node 22, PostgreSQL container administration rights, and an external backup directory are available. Run `bash infra/backup-db.sh staging` to generate a validated archive, outside the sync/deploy directory.
3. Run `bash infra/rehearse-db-restore.sh staging /absolute/path/to/epmo-staging-YYYYMMDDTHHMMSSZ-XXXXXXXX.dump` using the precise path printed in step 2. The script verifies the `.sha256` sidecar and cleans up its temporary database.
4. To use the integrated staging sequence from an operator workstation with pinned SSH host keys, set `EPMO_DEPLOY_HOST=deploy@staging.example.com` and run `bash infra/deploy.sh staging`. This will repeat the backup and rehearsal before migrations.
5. If cleanup fails, **stop** and have a database administrator inspect the temporary `epmo_restore_...` database. Do not assume the rehearsal left no data behind.

## Verification record

- Node-based mock tests simulate both success and failures, including bad backups, refused production mode, failed restore, failed cleanup, and deployment sequencing. **These tests are not a live PostgreSQL restore.**
- A production build, actual staging PostgreSQL restore, tenant-isolation runtime checks, Stripe test-mode payment, SES email delivery and bilingual browser acceptance still require a staging environment.
- The acceptance gate must remain blocked until those live results exist. `npm run test:offline` verifies source-level behavior only.

## Phase 17D — First-time staging bootstrap correction

The rehearsal runs **before** the first SQL migration. On a new staging
installation, the source database legitimately has none of `public.tenants`,
`public.memberships`, or `public.schema_migrations`. A valid backup of that
initial state now passes the isolated restore rehearsal if the restored
database also lacks all three.

On an existing installation, **all three** tables must be present in both
source and restored databases. A partially initialized source, an empty
backup for an existing installation, or an unexpected populated backup for a
fresh installation **blocks** deployment. This is a schema-state check, not a
comparison of row-level customer data and not a substitute for a full disaster
recovery drill.

Regression tests: `node --test scripts/phase16b-restore-rehearsal.test.mjs`.
Staging still needs a real PostgreSQL restore test and migration execution.

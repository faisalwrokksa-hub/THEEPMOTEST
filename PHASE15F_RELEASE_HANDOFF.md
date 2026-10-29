# The EPMO — Phase 15F: Release handoff and recovery plan

**Status: RELEASE NOT APPROVED.** This source-only milestone improves release safety and documentation; it does **not** verify a running deployment. The previous CI evidence gate remains authoritative for build and security checks.

## What changed

1. `infra/deploy.sh` now builds API/web images **before** database migrations. A failed image build must not alter PostgreSQL.
2. Staging and production deployments must complete `infra/backup-db.sh` before calling `infra/bootstrap-db.sh`; a failed dump or invalid archive blocks migration.
3. `infra/backup-db.sh` creates a private PostgreSQL custom-format snapshot, reads its table of contents with `pg_restore --list`, and writes a SHA-256 sidecar. The default directory is `${HOME}/the-epmo-backups/{staging|prod}` **outside** the rsync `--delete` application tree. An operator may set `EPMO_BACKUP_DIR` on the remote host.
4. `scripts/phase15f-backup-release.test.mjs` verifies ordering and fail-closed behavior with mocked Docker commands, NOT an actual database.

**Limits:** `pg_restore --list` checks archive readability, not completeness of a restoration. It cannot replace a successful restore rehearsal to an isolated database. Backups on one server are not sufficient disaster recovery; copy encrypted backups to secured off-site storage and test recovery access. Backup retention, encryption and monitoring must be configured by the hosting operator.

## Pre-deployment checklist (staging first)

- [ ] Freeze the release commit and verify its archive checksum. Store release assets and the previous working deployment image IDs/tags so application rollback is possible. **This repository does not yet automate preservation of the previous application images.**
- [ ] Confirm the target is an isolated staging environment with its own Stripe test keys, SES test/approved recipient workflow, PostgreSQL instance, DNS, and TLS.
- [ ] Set server-owned `.env.staging` or `.env.prod` (never committed). Verify the deployment preflight (`node scripts/rc1-release-gate.mjs`).
- [ ] Confirm a private, writable, sufficiently sized backup location outside the rsync path; monitor free space. The deployment account must have permission to create this directory.
- [ ] Verify `pnpm install --frozen-lockfile`, TypeScript checks, complete compiled API and Next.js artifacts, dependency audit, and all applicable offline tests.
- [ ] Inspect the 18 ordered SQL migrations, check the migration ledger, confirm RLS policies (including financial tables), and verify a restricted application database login.
- [ ] Apply the same deployment commands to staging; confirm the dump, matching `.sha256`, migrations, application health, and API tenant-isolation tests.
- [ ] Run signed Stripe test Checkout/webhook with replay protection; verify invoice + subscription exactly once. Do NOT use live keys or live payment cards for this rehearsal.
- [ ] Send and accept a controlled SES invitation; test expiration, revocation, single use and wrong-tenant denial.
- [ ] Test Arabic RTL and English LTR customer and Super Admin browser workflows (including keyboard navigation).
- [ ] Rehearse a full backup **restore into an isolated staging database**, check record counts/migrations/RLS, and document the result.
- [ ] Rehearse *application* rollback using preserved previous image tags, validate health and data compatibility after any forward-only schema change.
- [ ] Capture the actual GitHub CI evidence receipts and staging/UAT evidence for this release; `verify launch` must pass. Source-only tests are not acceptance evidence.
- [ ] Approve DNS/TLS, monitoring, alerts, access controls, off-site encrypted backups, retention rules, recovery objectives and incident contacts **before** production.

## Deploy commands

From a trusted operator machine with configured SSH host keys:

```sh
EPMO_DEPLOY_HOST=deploy@your-staging-host infra/deploy.sh staging
# Production only after CI, staging, restore, rollback and human approval:
EPMO_DEPLOY_HOST=deploy@your-production-host infra/deploy.sh prod
```

Deployment flow: explicit host and SSH trust -> remote environment readiness -> rsync excluding secrets -> safety preflight -> **build API/web images** -> start DB/Redis -> **verified DB backup** -> SQL migrations and RLS -> update API/web -> bounded health check. There is no automatic rollback after a failed migration or unhealthy web deployment; intervene using the documented recovery process.

## Restore rehearsal (staging ONLY)

1. Verify a dump/checksum pair. In the backup directory, run `sha256sum -c <backup-file>.sha256`. Confirm its digest and file provenance.
2. Provision an **isolated empty PostgreSQL database** on the staging/test server. Never restore into the live database. Confirm the database name and target connection explicitly before any command that mutates data.
3. Use PostgreSQL's `pg_restore --exit-on-error --single-transaction --no-owner --no-acl` on the custom-format dump against that empty database. Do this as an authorized DBA with a fresh maintenance database, after reviewing SQL extensions and users.
4. Compare tenant, membership, subscription, invoice, payment and migration-ledger counts with the backup inventory. Confirm RLS is enabled and enforced for the restricted application role. Then exercise read-only application queries against the isolated restore.
5. Save the actual command output, destination identifier, duration and data checks in a secured acceptance record. An archive listing alone is **not** a passing restore rehearsal.

## Failure / rollback decision tree

- **Build fails:** Stop. Production API and schema should still be untouched; fix code/build and rerun staging.
- **Backup fails:** Stop. Do **not** apply migrations. Fix disk/permissions or database availability and retry a fresh backup.
- **Migration fails:** Stop; each migration file is transactionally applied with its ledger record. Do not manually edit the ledger. The application images have been built but the database may have earlier successful migrations; inspect schema/ledger and restore only under DBA incident procedure if required.
- **API/web health fails after migration:** Preserve logs and database snapshot; assess schema backward compatibility. A prior image may be started only if its compatibility with the **migrated schema** has been verified. Never assume reverting the application images automatically rolls back SQL migrations.
- **Confirmed data corruption:** Quiesce writes, preserve incident evidence, follow the approved point-in-time backup/restore procedure. Restore only into a verified target and apply an operator-reviewed cutover plan. Never run an automated destructive restore on the production database.

## Evidence still missing

- Successful dependency-backed NestJS/Next.js build and compiled-web smoke checks.
- Execution of 18 migrations and concurrent-access/tenant-isolation tests against live PostgreSQL.
- Stripe test-mode payment, signed webhook replay and subscription ledger validation.
- Real SES email delivery and single-use invitation acceptance.
- Arabic/English browser acceptance, backups restored and application rollback rehearsed.

**Release verdict: NO-GO until all live/staging blockers are closed and verified.**

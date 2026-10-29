# The EPMO — Phase 16A: Staging backup safety (source milestone)

**Release verdict: NOT PRODUCTION APPROVED.** This package includes stronger backup validation and offline tests. It has not restored PostgreSQL data, completed a real Stripe payment, run a full NestJS/Next.js build, or deployed to staging.

## Verified changes

- `infra/backup-db.sh` rejects `EPMO_BACKUP_DIR` if it resolves to the project root or any descendant. This prevents deployment's `rsync --delete` from accidentally removing database backups.
- The check canonicalizes the path with `realpath -m` before creating the directory, covering paths through symlinked parents and nonexistent leaf directories. It checks again after creation.
- If SHA-256 verification fails after writing a final `.dump` and `.sha256`, both files are removed so an invalid archive is not left looking complete.
- Added five backup safety regression cases, alongside the six existing cases. Mocked Docker tests are not live PostgreSQL backup verification.

## Run offline checks

```sh
npm run test:offline
node scripts/verify-release-static.mjs
node scripts/verify-migration-chain.mjs
bash -n infra/backup-db.sh infra/deploy.sh
```

## Staging-only handoff

1. Provision a **separate staging server** with Node.js 22, pnpm 10.17.0, Docker Compose, PostgreSQL 16 and Redis. Give staging its own DNS/TLS, customer accounts, and Stripe test credentials. Do not paste secrets into chat or commit `.env.staging`.
2. Place the checked-out source under `/opt/the-epmo-staging` (or an explicit deploy directory). Keep backups outside that root, e.g. `/srv/the-epmo-backups/staging`. Avoid placing them in a parent shared by `rsync --delete` jobs.
3. Run the existing configuration preflight and test the full dependency-backed build. Then execute `infra/deploy.sh staging` only after the remote environment has been set up and reviewed.
4. Inspect the produced backup and sidecar checksum, then perform an isolated PostgreSQL **restore rehearsal**; an archive TOC and checksum are not enough.
5. Run the financial tenant-isolation suite, concurrent stage-gate test, signed Stripe test-mode webhook + replay test, SES invitation test, bilingual browser acceptance, and CI release-evidence checks.

### What remains unverified

- pnpm install/full compile: **blocked locally** by registry DNS unavailability.
- Docker, PostgreSQL and real backup/restore: **not available locally**.
- Stripe and SES staging integrations: **not configured / not run**.
- Browser-based E2E and staging deployment: **not run**.

**Do not deploy to production based only on these offline checks.**

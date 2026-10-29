# The EPMO Phase 12 RC1 — Staging acceptance handoff

**Release decision: BLOCKED until a real staging build, PostgreSQL isolation test,
Stripe test-mode payment and bilingual UAT pass.** The development workspace has
Node 22 but no pnpm dependency installation, Docker/PostgreSQL runtime, staging
server, or Stripe credentials; simulated tests do not establish live readiness.

## Checkpoint delivered in this package

- `infra/deploy.sh` requires a trusted explicit destination and now verifies
  remote directory, environment file, Node, and Docker **before** `rsync --delete`.
- Default deployment directories: `/opt/the-epmo-staging`, `/opt/the-epmo`,
  and `/opt/the-epmo-dev`. For an EXISTING installation using the earlier legacy
  directory, explicitly set `EPMO_DEPLOY_DIR` after confirming the destination;
  changing directories does not migrate volumes, secrets or existing data.
- `infra/bootstrap-db.sh` times out instead of waiting indefinitely for
  PostgreSQL, verifies the exact applied SQL migration ledger matches this
  release, and executes `assert-financial-rls.sql` before declaring success.
- `infra/sync-catalogue.sh` no longer contains a hardcoded server IP/private-key
  path and cannot silently select production. It supports `staging`, `dev`, `prod`.

## Local check commands (Node 22; no external dependencies)

```sh
npm run test:offline
node scripts/verify-migration-chain.mjs
node scripts/verify-release-static.mjs
node scripts/rc1-release-gate.mjs
bash -n infra/deploy.sh infra/bootstrap-db.sh infra/sync-catalogue.sh
```

## Real staging prerequisites (provide securely, never in chat)

- Trusted Ubuntu/Linux SSH destination with Docker Compose v2, Node 22,
  trusted host key in `known_hosts`, persistent database backups and TLS/DNS.
- On the server, prepare `/opt/the-epmo-staging` and its `.env.staging`
  file from `.env.staging.example`. Keep the real file on the server; permissions
  `0600` recommended. Provision credentials through the chosen secret store.
- Stripe **test** secret and webhook signing secret configured privately, with a
  reachable public HTTPS webhook. Never use live Stripe keys in staging.

## Deploy and verify — run from a trusted development machine

```sh
export EPMO_DEPLOY_HOST=deploy@YOUR_TRUSTED_STAGING_HOST
# If upgrading an older installation only: export EPMO_DEPLOY_DIR=/approved/legacy/path
# If required: export EPMO_DEPLOY_SSH_KEY=/trusted/private/key
infra/deploy.sh staging
```

On the staging server, from the release directory:

```sh
node scripts/rc1-release-gate.mjs --mode staging --env-file .env.staging
# Container runtime has pnpm and installs packages during Docker build.
docker compose -f docker-compose.prod.yml -p pmo-staging --env-file .env.staging ps
# Run with the administrator role, substituting server-local PG_USER/PG_DB:
docker compose -f docker-compose.prod.yml -p pmo-staging --env-file .env.staging \
  exec -T postgres psql -U pmo_admin -d pmo -v ON_ERROR_STOP=1 \
  < packages/db/sql/assert-financial-rls.sql
```

**Migration-history caveat:** The deployment bootstrap uses `schema_migrations`
while `pnpm db:migrate` uses Drizzle's own ledger. Do NOT alternate paths on one
existing database. Take and verify a restorable backup before migrations and
resolve any Drizzle/SQL-ledger mismatch before continuing. The bootstrap
intentionally refuses an existing Drizzle ledger.

## Acceptance evidence still required

1. Built API and web containers healthy, migrations applied, full TypeScript
   checks and pnpm integration tests passing on staging/CI.
2. `pmo_app` role is non-superuser with no `BYPASSRLS`; financial RLS forced,
   two real test tenants isolated. Run `scripts/stripe-db-rls-audit.mjs` with two
   **disposable staging tenant IDs** and the restricted connection.
3. Stripe test-mode Checkout: exact invoice amount/currency, signed webhook,
   exactly one ledger payment and period extension. Replay the same webhook:
   no duplicate settlement or second extension. Run the supplied Stripe
   evidence verifier with staging credentials in the server secret store.
4. Browser UAT: Arabic/English switching, RTL layout, onboarding, license
   expiration, Super Admin controls, invoices, cancellation, and renewal.
5. Backup/restore exercise, incident logging, rollback plan, approval by
   security/operations and payment/legal stakeholders before live keys.

**No live server, PostgreSQL, or Stripe account was accessed in this milestone.**

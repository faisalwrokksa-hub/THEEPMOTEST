# The EPMO — Phase 12 Release Candidate 1 (RC1)

**Status: source/package verification only. NOT a production release.** The offline checks do not verify PostgreSQL, Redis, Stripe credentials, API startup, compiled apps, or tenant-isolation behavior on a running system.

## RC1 code changes

- Added explicit Stripe environment pass-through to the API in `docker-compose.prod.yml`. Secret credentials do **not** go to the web container or `NEXT_PUBLIC_` variables. The production reference webhook stays disabled.
- Fixed the configuration guard mismatch between `apps/api/src/common/env.ts` and `stripe.service.ts`: a production-compiled staging API accepts Stripe **test** keys only when `DEPLOYMENT_ENV=staging` and `STRIPE_ALLOW_TEST_MODE_IN_PRODUCTION=true`. Staging rejects live keys. A production deployment rejects the staging override.
- Added a dependency-free RC1 gate for key presence/mode, webhook origin/path, strong service credentials, restricted PostgreSQL application role, Docker mappings, and CI prerequisites. It reports only check names, never secrets.
- Extended `infra/bootstrap-db.sh staging` for an isolated Compose project; use long URL-encoded database passwords. The existing bootstrap SQL migration ledger is independent of the Drizzle journal; see warning below.
- CI now runs the RC1 repository gate before dependency installation, in addition to its existing migration, RLS, typecheck, build and test jobs.

## 1. Offline source preflight (run anywhere with Node 22)

```bash
node scripts/verify-migration-chain.mjs
node scripts/verify-release-static.mjs
node scripts/rc1-release-gate.mjs
npm run test:offline
bash -n infra/bootstrap-db.sh
```

## 2. Stage environment (requires a staging server)

1. Provision TLS for the web and public API hostnames; ensure DNS and reverse proxy forward `POST /api/v1/billing/stripe-webhook` with the **unmodified raw body**. Set up persistent, backed-up PostgreSQL and Redis and an approved secret store.
2. Copy `.env.staging.example` to `.env.staging`. Generate strong distinct PostgreSQL admin, `pmo_app`, and Redis passwords; URL-encode reserved characters in service URLs. Set `STRIPE_SECRET_KEY=sk_test_...` and `STRIPE_WEBHOOK_SECRET=whsec_...` from your Stripe test-mode account. Never paste keys into chat, commits, or CI logs. Ensure `.env.staging` is untracked, permissions `0600`.
3. Run the environment preflight (it does NOT contact Stripe):

```bash
node scripts/rc1-release-gate.mjs --mode staging --env-file .env.staging
```

Expected: 24/24 checks pass. The supplied `.env.staging.example` intentionally **fails** until real secrets replace placeholders.

## 3. Install and deploy isolated staging containers

```bash
# In the checked-out release directory with Docker Compose v2 available:
docker compose -p pmo-staging -f docker-compose.prod.yml --env-file .env.staging \
  up -d postgres redis
# First deployment only / after a verified database snapshot:
infra/bootstrap-db.sh staging
# The API container must receive Stripe test settings via Compose, not only .env.staging.
docker compose -p pmo-staging -f docker-compose.prod.yml --env-file .env.staging \
  up -d --build api web
# Confirm that API and web report healthy before the next tests:
docker compose -p pmo-staging -f docker-compose.prod.yml --env-file .env.staging ps
```

**Important:** `infra/bootstrap-db.sh` uses the existing `schema_migrations` SQL ledger, while `pnpm db:migrate` uses Drizzle's migrations journal. Do **not** alternate the two migration tools on the same database without reconciling their histories. Back up the database and choose one migration strategy for each environment. Migrations are not a substitute for a rollback plan or data backups.

**Important:** Set up the application role `pmo_app` with a non-default password *before* starting the API. The RLS script alone creates a **NOLOGIN** placeholder if the role is missing; it does not manufacture a development password. Production deployments must provision the login securely and verify that `pmo_app` is not a superuser, owner, or BYPASSRLS role.

## 4. Verify real PostgreSQL, integration API, and Stripe **test mode**

```bash
# Inside an environment with pnpm 10.17 and installed dependencies:
pnpm typecheck
pnpm build
pnpm test
pnpm verify:rls
# Against the staging PostgreSQL container, using the admin role:
docker compose -p pmo-staging -f docker-compose.prod.yml --env-file .env.staging \
  exec -T postgres psql -v ON_ERROR_STOP=1 -U pmo_admin -d pmo \
  < packages/db/sql/assert-financial-rls.sql
```

Run the financial row-level-security audit (`node scripts/stripe-db-rls-audit.mjs`) as a **restricted** application database role with two disposable tenant IDs. Run the Stripe staging configuration preflight inside the API container if its script is included in the image:

```bash
docker compose -p pmo-staging -f docker-compose.prod.yml --env-file .env.staging \
  exec api node scripts/stripe-staging-preflight.mjs
```

Complete a Stripe test-mode Checkout invoice, record signed webhook delivery, confirm exactly one invoice payment and one subscription extension; replay the signed event and verify **no second extension**. Check an unpaid Checkout cannot change entitlements, test another tenant's unauthorized API access, and run `scripts/stripe-staging-evidence.mjs` using **test** Stripe credentials and the documented two-tenant workflow. Check logs and payment ledger for consistency without exposing secrets.

**Before production:** inspect refund/chargeback workflows, tax and invoice obligations, credential rotation, backup restore, rollback, alerts, Arabic/English browser flows, access-control and security review. Do not put test keys or staging override flags in the production environment.

## Verification recorded for this RC1 package

- Node 22 dependency-free tests and source checks: recorded in `PHASE12_RC1_RESULTS.md`.
- Dependency installation: **blocked** in this workspace (npm registry DNS unavailable); full TypeScript/build not executed.
- Docker/PostgreSQL runtime: **not present** in this workspace; no real DB migration or tenant isolation integration tests executed here.
- Stripe: **no live/test charge** executed and no webhook was received by a deployed service.

**Release decision: BLOCKED for production until real integration and acceptance checks pass.**

## RC1 secure deployment transport (additional checkpoint)

The `infra/deploy.sh` script now supports `staging`, `dev`, and `prod`. It intentionally
refuses to guess a server address or bypass SSH host verification. Configure your
trusted SSH key and `known_hosts` outside the source tree, and provision the staging
server's `.env.staging` using a secret manager before deploying.

```bash
# On a trusted build/deployment machine with rsync, SSH, and network access:
export EPMO_DEPLOY_HOST=deploy@staging.theepmo.com
# Optional: export EPMO_DEPLOY_SSH_KEY=/path/to/your/private-key
# Optional: export EPMO_DEPLOY_DIR=/opt/the-epmo-staging
infra/deploy.sh staging
```

The script uploads source **without** `.env.*`, runs the RC1 configuration gate
using the existing server-side environment, starts Postgres/Redis, bootstraps
the schema, builds and starts the services, then waits up to three minutes
for the web container to become healthy. A failed preflight, migration, build,
or health check aborts the deployment. This does not automatically roll back
partially applied migrations. Make a verified database backup before upgrades.

To deploy production, explicitly set its approved hostname and run
`infra/deploy.sh prod`; production still requires local `pnpm verify`.
The prior legacy default server IP and unsafe `StrictHostKeyChecking=no`
behavior have been removed.

**Verification limit:** Tests simulate the SSH/rsync command flow; there has been
no network deployment or real staging health check in this workspace.

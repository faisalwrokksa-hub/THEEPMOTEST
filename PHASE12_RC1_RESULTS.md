# The EPMO — Phase 12 Release Candidate 1: verification report

## Source baseline

- Input: `the-epmo-phase12-migration-ci-security-gate.zip`.
- Output: `the-epmo-phase12-rc1-staging-preflight.zip`.
- No customer/staging/production databases or Stripe accounts were accessed.

## Confirmed source changes

1. `docker-compose.prod.yml` explicitly passes server-only Stripe credentials and mode flags to the API process; it never passes them to the web container. The reference payment webhook stays disabled.
2. `apps/api/src/common/env.ts` aligns staging test-key startup authorization with the Stripe service. Production uses live keys and rejects the staging override. Staging refuses live Stripe keys.
3. `apps/api/src/platform/stripe-policy.ts` rejects live-money payment mode in staging, with a regression test.
4. `scripts/rc1-release-gate.mjs` adds a dependency-free source and configuration preflight. `scripts/rc1-release-gate.test.mjs` covers positive and blocked cases, including URL/role/credential isolation. The gate is included in `.github/workflows/ci.yml`.
5. `.env.staging.example`, `.gitignore`, `infra/bootstrap-db.sh staging`, and `PHASE12_RC1_STAGING_RUNBOOK.md` provide staging setup instructions and safeguards, including URL-decoding the application password and escaping its SQL literal.

## Checks run here (actual results)

| Command | Result |
|---|---|
| `npm run test:offline` | **156/156 passed** |
| `node scripts/verify-release-static.mjs` | **8/8 check groups passed** |
| `node scripts/verify-stripe-integration.mjs` | **22/22 checks passed** |
| `node scripts/verify-migration-chain.mjs` | **16/16 journaled SQL files matched** |
| `node scripts/rc1-release-gate.mjs` | **9/9 repository checks passed** |
| `node --test scripts/rc1-release-gate.test.mjs` | **17/17 passed** (included in 156) |
| `bash -n infra/bootstrap-db.sh` | **Passed** |
| `node scripts/rc1-release-gate.mjs --mode staging --env-file .env.staging.example` | **19/24** (intentionally BLOCKED: example has no real secrets) |

## Tests NOT completed in this environment

- `corepack pnpm --version` could **not fetch pnpm 10.17.0**: DNS lookup of `registry.npmjs.org` failed (`EAI_AGAIN`). Workspace dependencies are not installed. No full pnpm typecheck/build, API startup, web rendering, or Vitest integration suite executed.
- Neither Docker nor `psql` is installed. No PostgreSQL migration, RLS live audit, or bootstrap script was executed against a real database.
- No Stripe test credentials or deployed staging hosts are available. No Checkout, webhook, payment, or renewal has been processed or verified through Stripe.

**Release decision: RC1 source milestone delivered, staging acceptance blocked; do not promote to production.** Follow `PHASE12_RC1_STAGING_RUNBOOK.md` for real staging tests. Do not disclose private credentials in chat or commit them.

## RC1 database bootstrap follow-up (2026-10-26)

- Fixed SQL bootstrap crash/retry drift: migration SQL and the `schema_migrations` ledger insert now run within a single explicit SQL transaction, aborting together on error. Previously the migration and ledger write were separate transactions; `psql -1` on stdin was not sufficient to guarantee atomicity.
- Added a guard against using the legacy SQL-ledger bootstrap on a database where a Drizzle migration journal already exists. These two migration methods must not be combined on one database.
- RLS setup creates missing `pmo_app` only as `NOLOGIN`; password and login activation are provisioned separately with a strong secret. Revoked the app role's access to the legacy migration ledger.
- Corrected CI to provision the `pmo_app` role **before** journal migrations (`0009` includes grants to that role). CI uses a distinct test-only password.
- Automated dependency-free regression assertions added in `scripts/rc1-db-bootstrap-hardening.test.mjs`.

**Verification boundary:** Bash syntax, source assertions, Node offline suite, migration-chain and RC1 repository checks can run here. A live PostgreSQL transaction, pnpm full build, Stripe test charge, and browser acceptance tests still require a staging runner. No credentials or operational payment proof is included in this archive.

# P0 Checkpoint 12 — First GitHub Actions run handoff

## Current, independently verified status

The GitHub connection available to this chat returns **zero accessible repositories**. There is no repository or workflow run to check, so **no CI run, application build, PostgreSQL migration, Stripe payment, or browser acceptance took place here**.

The local environment has Node 22 but does not have Docker, PostgreSQL client (`psql`), or a cached pnpm 10.17.0 installation. A Corepack attempt to acquire pnpm failed because the package registry was unreachable.

Offline checks completed for this package:

- `npm run test:offline` — **713/713 pass**, including six new CI trigger/read-only-permission contract tests.
- `node scripts/verify-release-static.mjs` — **8/8 groups pass**.
- `node scripts/verify-migration-chain.mjs` — **20 ordered migration files pass**.
- `node scripts/rc1-release-gate.mjs` — **9/9 preflight checks pass**.
- GitHub Actions YAML was parsed: jobs `source-guards`, `verify`, `audit`; manual `workflow_dispatch` trigger recognized.
- `node scripts/verify-build-artifacts.mjs --scope all` — **0/8 pass, expected** because dependencies and production build artifacts are absent. This is a **launch blocker**, not a CI success.

## First CI run (actions to complete in GitHub)

1. Create or choose a **private repository**, and grant the connected GitHub integration access. Neither repository creation nor source push is performed by this checkpoint.
2. Extract the ZIP. Commit the **contents of the `the-epmo/` directory as the repository root**. The root must contain `package.json`, `pnpm-lock.yaml`, and `.github/workflows/ci.yml` (do **not** upload the ZIP as a single repository file).
3. Confirm the repository default branch is `main`, or adjust the workflow push trigger to the chosen branch. Never commit actual `.env` files, credentials, customer data, or backup archives. The tracked `.env*.example` files are templates.
4. Open **GitHub → Actions → CI → Run workflow** on the default branch. The `workflow_dispatch` event added in this checkpoint permits a deliberate first run; the existing push and pull-request triggers remain.
5. Expect three jobs: `source-guards` (dependency-free checks), `verify` (pnpm builds, PostgreSQL migrations and RLS, API and recovery integration, compiled web smoke), and `audit` (dependency vulnerability scan). **All three must pass**. Require them via branch protection before accepting changes.
6. Inspect the `epmo-ci-acceptance-<run id>` artifact: it is a **per-run test evidence summary**, not proof of live Stripe, Amazon SES or human browser acceptance. Resolve any red jobs, then re-run against the same private repository.
7. Separately exercise a **staging** environment with external HTTPS, SES invitation + recovery delivery, Stripe test payments, webhook retries and refunds, actual restore rehearsal, and bilingual manual acceptance before activating paid customers.

## Changes delivered

- `.github/workflows/ci.yml`: added `workflow_dispatch` for a manual first run and a default read-only `GITHUB_TOKEN` (`permissions: contents: read`). Existing push, pull-request, security, build and test gates remain intact.
- `scripts/p0-first-ci-readiness.test.mjs`: six offline checks that the workflow remains runnable and that required build, database, recovery and per-run evidence gates are still present.

**Decision: not ready to accept paying customers.** Full builds and live integrations are still outstanding. Confirm the legal jurisdiction of the payment-receiving business and payment-provider eligibility separately.

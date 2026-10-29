# The EPMO — Phase 15C: financial tenant-isolation acceptance gates

## Delivered

1. `scripts/phase15c-acceptance-safety.mjs`: reusable pre-reseed safeguard requiring `NODE_ENV=test`, a **separate** explicit disposable-database acknowledgement, the restricted `pmo_app` role, matching loopback PostgreSQL app/admin connections, and a local test API. The check runs **before** `reseed()` in `tests/phase15-billing-isolation.test.ts`. It does not prove the database is disposable—SSH tunnels can target remote instances—so the explicit operator acknowledgement is mandatory.
2. `scripts/phase15c-run-financial-rls.sh`: separate, read-only acceptance gate, intended for the CI disposable database **after** the billing API acceptance suite creates two tenants and invoices. Looks up only fixed demo tenant slugs, then calls the existing `scripts/stripe-db-rls-audit.mjs` as the restricted DB role. Checks forced row-level security and row visibility across six financial tables, including no-tenant access denial.
3. `.github/workflows/ci.yml`: requires the explicit opt-in for the destructive fixture and runs the live RLS audit after authenticated billing API tests. Any failure must stop CI. The source checks remain dependency-free and do not mutate the database.
4. New unit and wiring regression checks: `scripts/phase15c-acceptance-safety.test.mjs` (12) and `tests/phase15c-live-gate-wiring.test.mjs` (6).

## Verified locally in isolated environment

- `npm run test:offline`: **444/444 passing**, including 18 new tests.
- `node scripts/verify-release-static.mjs`: **8/8** groups passed.
- `node scripts/verify-migration-chain.mjs`: **18** migration definitions verified.
- `node scripts/rc1-release-gate.mjs`: **9/9** configuration gates passed.
- `bash -n scripts/phase15c-run-financial-rls.sh`: clean.
- TypeScript syntax parser: no parse errors for changed billing acceptance test.
- Running the live script without authorization **fails closed** (exit 1) as intended.

## Still NOT executed

- Live `pnpm exec vitest run tests/phase15-billing-isolation.test.ts` (requires a running API and disposable PostgreSQL database).
- Live read-only RLS audit of six financial tables; no database connection was available here.
- Full NestJS/Next.js dependency-backed build or typecheck; dependencies unavailable.
- Stripe test-mode checkout, signed webhook replay, SES email invitation delivery and browser RTL/accessibility acceptance.

## CI and staging instructions

Use GitHub Actions **verify** job with PostgreSQL and Redis services and a disposable database. The job configures `PHASE15_BILLING_ACCEPTANCE=true` **and** `PHASE15_ACCEPT_DISPOSABLE_DB=YES_RESEED_DISPOSABLE_TEST_DATABASE` for its acceptance steps. The script should not be run on customer databases, nor should those flags be set in production or a shared staging database.

If live CI fails, examine sanitized API output, failed integration-test assertions, database RLS catalog state, migration journal and seeded fixtures. Do **not** declare acceptance until the CI steps themselves show passing results against real services. A passing source test that inspects CI YAML is not evidence the CI job ran successfully.

Phase 15C adds release testing safeguards, not a production verification result. Do not promote this package without completing the outstanding live acceptance gates.

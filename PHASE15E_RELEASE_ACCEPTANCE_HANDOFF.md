# The EPMO — Phase 15E: evidence-driven release acceptance

**Scope:** These changes prepare CI to capture *actual* passing checks in a particular build, but do not themselves perform a full build, connect to PostgreSQL, or execute Stripe/SES tests. This project is **not yet production approved**.

## Included changes

- `scripts/phase15e-release-evidence.mjs`: records only allowlisted successful CI gates into the GitHub runner's temporary directory. Receipts contain gate name, current GitHub commit SHA, run ID, status and timestamp; no passwords, tokens, or invoice/customer data.
- `scripts/phase15e-release-evidence.test.mjs`: offline tests for missing, stale, invalid, duplicate, cross-run and altered receipts.
- `tests/phase15e-release-evidence-ci.test.mjs`: ensures CI records each receipt after its corresponding check and does not claim Stripe, SES or browser approval without testing them.
- `.github/workflows/ci.yml`: records 9 gates after actual checks: packages build, SQL migrations/RLS, TypeScript, tenant isolation/data integrity, live billing API isolation, financial RLS row visibility, suite tests, compiled production build and live bilingual web smoke. After all steps, verifies all 9 receipts belong to the same commit/run; if a step fails, the summary fails closed and publishes any partial evidence for diagnosis. Next.js production build explicitly uses `NODE_ENV=production`.

## What passes in dependency-free environments

Run from repository root:

```sh
npm run test:offline
node scripts/verify-release-static.mjs
node scripts/verify-migration-chain.mjs
node scripts/rc1-release-gate.mjs
```

For acceptance evidence **do not generate success receipts manually**. Receipts describe completed CI steps and are created automatically only after those steps succeed. Run `node scripts/phase15e-release-evidence.mjs verify ci` **only inside the CI runner** (requires `CI=true`, `GITHUB_ACTIONS=true`, valid `GITHUB_SHA`, `GITHUB_RUN_ID` and `EPMO_EVIDENCE_DIR` under `RUNNER_TEMP`). It will correctly fail if any gate did not run/pass for that build.

## Launch approval remains deliberately blocked

A passing CI evidence set is still **not** sufficient for production launch. The separate `verify launch` profile additionally requires independent, recent receipts from the *same release context* for:

1. `stripe_test_payment`: Stripe test-mode Checkout → signed webhook → exactly one invoice settlement + subscription extension, including webhook replay safety.
2. `ses_invitation_delivery`: deliver and accept one expiring invitation, verify single use, revocation and incorrect-tenant denial.
3. `bilingual_browser_review`: real browser + keyboard check in Arabic/RTL and English/LTR across onboarding, projects, billing and Super Admin.

These three checks are **not** recorded by CI automatically and have not been performed in this environment. Human-approved test documentation and scripts will be required before creating their receipts in a controlled staging workflow. A manually produced ZIP alone is not release evidence.

## Outstanding blockers

- Dependency-backed Node/pnpm install, TypeScript compilation, NestJS/Next.js artifact build.
- PostgreSQL 16, applying all ordered SQL migrations, and real RLS/concurrency/billing isolation tests.
- Configured Stripe test account/webhook, configured SES, trusted staging server and browser testing.
- Final security review and rollback/recovery rehearsal.

**The earlier offline test counts are not claims of full system runtime verification.**

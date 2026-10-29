# The EPMO — P0 Checkpoint 13: First-CI Database Seed Guard

## Repository status
The connected GitHub account did not return an accessible repository at the time of this checkpoint. A live GitHub Actions run, dependency-backed build, PostgreSQL tests and deployed acceptance remain **unverified**.

## Risk addressed
The existing demo seeder deletes and recreates named demo tenants and accounts, and seeds a vendor platform-admin identity. Before this checkpoint, `pnpm db:seed` itself did not require any environment proof or deliberate acknowledgement. An accidental invocation against a customer database could cause destructive or privileged fixture changes.

## Mitigation
- `packages/db/src/seed-safety.ts` validates that seeding is explicitly acknowledged, requires `NODE_ENV=test` or `development`, rejects staging/production `DEPLOYMENT_ENV`, requires restricted and admin connection URLs to refer to the same loopback PostgreSQL database, and rejects the application role being used for administrative operations.
- `packages/db/src/seed.ts` invokes that guard *before creating the PostgreSQL client or executing DELETE statements*.
- The GitHub Actions `verify` job explicitly acknowledges its disposable local PostgreSQL service, allowing both the initial fixture seed and test-suite reseeds without weakening production rules.
- README and `.env.example` warn local developers to acknowledge destructive seeding only in the shell.
- 11 independent offline tests confirm denial for production/staging, missing acknowledgement, remote URLs, mismatched databases, incorrect roles, and safe CI wiring.

## Local test results
- `npm run test:offline`: **724/724 passed** (11 new).
- `node scripts/verify-release-static.mjs`: **8/8 passed**.
- `node scripts/verify-migration-chain.mjs`: **20/20 consistent**.
- `node scripts/rc1-release-gate.mjs`: **9/9 checks passed**.
- New source files parsed by TypeScript. Full application build **not executed**.

## Next action for a real CI run
1. Create/connect a private GitHub repository containing this package's `the-epmo/` contents.
2. On GitHub, use **Actions → CI → Run workflow**, choose the branch and start the run.
3. Return the failing job log or the green run URL. Do not treat an offline or `source-guards`-only success as full acceptance.
4. Review secrets/merchant eligibility and fulfill the launch evidence (`Stripe` test payments, SES delivery, PostgreSQL permissions, browser acceptance) before accepting paying customers.

**Safety limits:** A loopback address may be an SSH tunnel. The explicit acknowledgement is mandatory but cannot independently prove that the database is disposable. This flow remains inappropriate on real customer data. No live database or CI run was performed here.

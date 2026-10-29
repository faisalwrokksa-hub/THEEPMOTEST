# The EPMO — Phase 15D: compiled-web bilingual and authorization smoke test

## Delivered

- `scripts/phase15d-web-smoke.mjs`: a **read-only**, localhost-only HTTP checker for a running Next.js standalone server. Checks `/login` in English (`html lang=en dir=ltr`) and Arabic (`pmo_lang=ar`, `html lang=ar dir=rtl`), localized sign-in labels, an actual sign-in form, and anonymous redirects to `/login` from `/billing`, `/super-admin`, `/getting-started` and `/projects`.
- `scripts/phase15d-run-web-smoke.sh`: checks the compiled Next.js standalone server artifact, refuses to accept an already-running HTTP service on port 3000, starts the compiled server with production runtime settings, waits up to 90 seconds, runs six live HTTP checks, and kills the temporary process on exit.
- `.github/workflows/ci.yml`: runs the new gate **after** the production Next.js build and artifact verification. A failed live response will fail the CI job.
- `scripts/phase15d-web-smoke.test.mjs` and `tests/phase15d-web-ci-wiring.test.mjs`: deterministic regression checks for locale/RTL failures, authentication redirect regressions, external redirect mistakes, unsafe test targets and CI wiring.
- Root `package.json`: `pnpm verify:web:acceptance` for a CI environment that has a built web app and an already-running API.

## Local source-only verification

- `npm run test:offline`: **465/465 tests passed** (includes **21** new Phase 15D tests).
- `node scripts/verify-release-static.mjs`: **8/8 release check groups passed**.
- `node scripts/verify-migration-chain.mjs`: **18/18 migration definitions verified**.
- `node scripts/rc1-release-gate.mjs`: **9/9 configuration checks passed**.
- `bash -n scripts/phase15d-run-web-smoke.sh`: passed.
- ZIP archive integrity checked before delivery.

## Outstanding live checks — not claimed complete

1. Restore pnpm 10.17.0 dependencies, `pnpm build:packages`, `pnpm typecheck`, build NestJS and Next.js.
2. Start API and disposable PostgreSQL in CI/staging; run `pnpm verify:web:acceptance` after a successful production Next.js build. Its **six HTTP checks have not run against a compiled application here**.
3. Run Phase 15A billing API acceptance and Phase 15C financial RLS acceptance with actual PostgreSQL.
4. Stripe test-mode end-to-end payment/renewal, SES invitation delivery, keyboard/screen-reader RTL acceptance and release approval.

This milestone increases release coverage but **is not** evidence that Phase 15D staging acceptance has passed. The built Next.js artifact and live runtime are still missing from this local environment.

# The EPMO — P0 Checkpoint 15: Production Docker image build gate

**Baseline:** `the-epmo-p0-ci-database-restore-checkpoint14.zip`.

## Confirmed gap and remediation

The GitHub Actions `verify` job compiled workspace/Next.js output, but did not build the production Dockerfiles. Compiled output can pass while the actual deployable images fail because of broken pnpm workspace symlinks, missing runtime files, incompatible Alpine dependencies or Dockerfile changes.

- `.github/workflows/ci.yml` now builds **both** `apps/api/Dockerfile` and `apps/web/Dockerfile` in CI, after the web build and before the `production_build` evidence receipt is recorded.
- `scripts/verify-ci-docker-images.sh` checks the resulting image user's identity (`pmo`, not root), configured healthcheck and exposed port, then runs a network-disabled, read-only shell inside each image to confirm the expected server entrypoint exists and is non-empty.
- **Neither image is published.** No registry credentials or customer secrets are needed.
- Eight new `scripts/p0-ci-docker-images.test.mjs` checks cover success and fail-closed behavior using a fake Docker command; these tests cannot substitute for a real build.

## Completed in this workspace

- `npm run test:offline` — **742/742 passed**.
- Focused image validation — **8/8 passed** (mocked Docker, not real images).
- `node scripts/verify-release-static.mjs` — **8/8 passed**.
- `node scripts/rc1-release-gate.mjs` — **9/9 passed**.
- `node scripts/verify-migration-chain.mjs` — **20/20 verified**.
- CI YAML parsed successfully; Bash script passed `bash -n`.
- ZIP CRC verified after packaging.

## First real CI run — still blocked

The linked GitHub account currently returns **zero accessible repositories**. This workspace has Node but cannot access npm registry (`EAI_AGAIN`) and has no pnpm, Docker, or PostgreSQL client. Consequently, **no real Docker build, Next.js/NestJS build, migration execution or browser/integration test was performed.**

To execute the pending gates:

1. Create or connect a **private** GitHub repository for The EPMO and place the contents of this archive's `the-epmo/` directory at the repository root.
2. Enable GitHub Actions. Use **Actions → CI → Run workflow**, targeting the current main branch.
3. Review all `source-guards`, `verify` and `audit` jobs, including **Build production API Docker image**, **Build production web Docker image**, **Verify API and web image runtime identity** and live database tests.
4. Inspect the `epmo-ci-acceptance-*` artifact and failure logs. Fix any real build, PostgreSQL, or integration defects and rerun.
5. Before accepting payment, separately validate Stripe/eligible payment provider, SES delivery, real HTTPS staging, Arabic/English customer journeys, and operational readiness.

**Production status: not approved.** CI source/test evidence is not an actual hosted acceptance test.

# Phase 16D — Staging API authentication acceptance

## Delivered

- `scripts/phase16d-verify-staging-api.mjs`: dependency-free, read-only staging acceptance. The host wrapper checks that the container is the healthy `pmo-staging/api` service, running with `NODE_ENV=production`, `DEPLOYMENT_ENV=staging`, and `ALLOW_HEADER_AUTH=false` and that port 4000 is not published. It then uses `docker exec` to probe **that exact API container** via `http://127.0.0.1:4000`.
- Checks actual API health identity, then expects **HTTP 401** for eight unauthenticated customer-billing, subscription, platform, and vendor Super Admin GET routes. Finally, checks that forged `x-tenant-id` and `x-user-id` headers cannot bypass authentication on billing and Super Admin.
- `infra/deploy.sh staging` now runs the API acceptance after the Phase 16C bilingual-web acceptance and before reporting successful deployment.
- `apps/api/Dockerfile` includes the two dependency-free scripts needed for the in-container probe.
- 14 regression tests check target attestation, negative paths, read-only behavior, anti-header-spoof checks, packaging, and deployment wiring.

## Running on a configured staging server

After a production-built staging stack is running, in the source directory:

```bash
container=$(docker compose -f docker-compose.prod.yml -p pmo-staging --env-file .env.staging ps -q api)
node scripts/phase16d-verify-staging-api.mjs --env-file .env.staging --container "$container"
```

No secrets are passed to or logged by this verifier. It should never run against customer production data or a published remote API endpoint. It makes GET requests only. It rejects redirects instead of treating them as successful authentication.

## Verified offline in this package

- `npm run test:offline`: **531/531 passed** (including 14 new Phase 16D checks).
- `node scripts/verify-release-static.mjs`: **8/8 passed**.
- `node scripts/verify-migration-chain.mjs`: **18 ordered SQL migration definitions passed**.
- `node --check scripts/phase16d-verify-staging-api.mjs` and `bash -n infra/deploy.sh`: passed.
- ZIP integrity: verified at packaging time.

## Not verified; blocks production approval

- Full dependency-backed Next.js and NestJS build; this environment lacks pnpm and cannot fetch dependencies.
- Real staging deployment and these newly added live API GET checks.
- PostgreSQL migration, restore, concurrent-write and tenant-isolation execution against a database.
- Stripe test-mode Checkout/verified webhook and SES invitation delivery.
- Authenticated bilingual customer journeys and browser accessibility testing.

This is a staging *authentication-boundary* smoke gate, **not** a substitute for authenticated tenant-isolation or payment acceptance tests.

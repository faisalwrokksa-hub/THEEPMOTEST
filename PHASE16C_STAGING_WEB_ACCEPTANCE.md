# The EPMO — Phase 16C: Staging post-deployment HTTP acceptance

## Delivered

- `scripts/phase16c-verify-staging-web.mjs`: a read-only HTTP acceptance tool which first checks Docker metadata to attest that the local HTTP endpoint belongs to the healthy `web` container in Compose project `pmo-staging`.
- `scripts/phase16c-verify-staging-web.test.mjs`: 13 new offline tests covering wrong Docker project/service, production-mode refusal, invalid/published ports, stopped/unhealthy containers, Arabic/English login responses, anonymous private-route access, and a simulated deploy failure.
- `infra/deploy.sh`: after the existing bounded health check, **staging only** runs the acceptance tool against the just-deployed web container; any failure exits nonzero and prevents a `PASS` deployment message.

## Staging run

Use your configured staging machine, with `.env.staging` and verified SSH keys already provisioned, and run the usual `infra/deploy.sh staging` from the source tree with `EPMO_DEPLOY_HOST=user@staging.example.org`. The acceptance command is called by deployment automatically:

```bash
container=$(docker compose -f docker-compose.prod.yml -p pmo-staging --env-file .env.staging ps -q web)
node scripts/phase16c-verify-staging-web.mjs --env-file .env.staging --container "$container"
```

This step requires `DEPLOYMENT_ENV=staging`; the staged web mapping **must bind to 127.0.0.1** and optionally specify a non-privileged `WEB_PORT` (defaults to 3000). If your staging web port is exposed on a public interface, adjust to a loopback mapping before running this acceptance test. The script refuses production containers and remote URLs.

What it checks through real unauthenticated GET requests:

1. English login response is HTML, includes the expected sign-in text and login form, and is `lang=en`, `dir=ltr`.
2. Arabic login response is translated HTML with `lang=ar`, `dir=rtl`.
3. `/billing`, `/super-admin`, `/getting-started`, and `/projects` redirect unauthenticated visitors to **the same local origin** `/login`.

## Offline verification, not staging acceptance

- `npm run test:offline`: **517/517 passed** (includes 13 new Phase 16C tests).
- `node scripts/verify-release-static.mjs`: **8/8 passed**.
- `node scripts/verify-migration-chain.mjs`: **18 migration files matched the ledger**.
- `node scripts/rc1-release-gate.mjs`: **9/9 repository checks passed** (without staging env credentials).
- `bash -n infra/deploy.sh infra/backup-db.sh infra/rehearse-db-restore.sh`: passed.

These results **do not** establish a successful production build, deployed staging check, PostgreSQL migration/restore, Stripe test payment, SES invitation, or human browser acceptance. Those still require staging access, secrets configured outside source, and separately retained run evidence. In particular, an HTTP smoke test does not exercise authenticated end-to-end workflows or payment processing.

## Release status

**Staging check implementation complete; actual staging execution pending.** Do not mark the product production-ready based on this package alone.

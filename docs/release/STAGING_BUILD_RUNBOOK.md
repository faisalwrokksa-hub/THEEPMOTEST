# S08 staging TLS edge, monitoring and recovery — review-only build artifacts

**Status: NOT DEPLOYED / NOT RELEASE-ACCEPTED.** These are repository templates for an
isolated staging environment, not evidence of running staging, public TLS, real
Stripe TEST receipts, Microsoft consent, database restoration or browser UAT.
Do not run infrastructure-mutating commands until a separate, specific staging
action is authorized. Never use production credentials or customer data.

## What is implemented

- `infra/staging/edge.compose.yml`: opt-in TLS reverse proxy on loopback
  `127.0.0.1:8443` by default. It reaches `web:3000` and `api:4000`
  over the **private Docker network**. It does **not** publish the API port.
- `infra/staging/nginx.conf`: exact web/API staging hostnames, TLS 1.2/1.3,
  unknown-host rejection, sanitized forwarded headers, Docker DNS re-resolution
  after container replacement, and an internal-only edge liveness endpoint.
  The API's existing `TRUST_PROXY_HOPS=1` default matches this **single**
  direct edge proxy. A second HTTP proxy would require explicit trust review.
- `infra/staging/preflight.mjs`: offline staging-only origin, loopback, port,
  certificate SAN/validity, key matching and private-key permission checks.
  It never prints key material or calls external systems.
- `infra/staging/health-probe.mjs` plus optional systemd unit/timer:
  anonymous GET-only HTTPS checks for API identity, web login and billing
  authentication denial. The timer records results in journald; it does not
  create an external paging integration.
- `infra/staging/images.compose.yml`, `build-images.sh`, `rollback.compose.yml`
  and `rollback-app.sh`: SHA-labelled local image selection and a guarded
  **application-only** rollback; no database downgrade or image pull.
- `infra/staging/verify-backup.sh`: offline checksum and PostgreSQL custom
  archive TOC verification. Existing `infra/backup-db.sh` and
  `infra/rehearse-db-restore.sh` remain the source of truth for actual staging
  backup and isolated restore rehearsal.

The existing `infra/deploy.sh` does **not** use these optional overrides.
No deployment integration or server change is claimed by this PR.

## Prerequisites (not provisioned here)

1. Isolated staging host and Docker Compose, trusted staging DNS/TLS routing,
   restricted database role, and server-owned `.env.staging` (never committed).
2. One valid certificate whose SAN covers **both**
   `staging.theepmo.com` and `api-staging.theepmo.com`, plus matching private
   key. Host paths must resolve outside the repository; the key must have no
   group/other permissions (typically 0600). A root Nginx master reads it,
   then workers drop privileges. Certbot symlinks are allowed when they resolve
   to a regular file outside the checkout.
3. Approved patched/pinned Nginx image digest and a review of host/edge network
   exposure. The template defaults to **loopback**. Do not change the bind to
   a public interface or route TCP 443 without separate infrastructure approval.
4. `STAGING_TLS_CERT_PATH` and `STAGING_TLS_KEY_PATH` set to the server's
   absolute paths in `.env.staging`, plus optional
   `STAGING_EDGE_BIND=127.0.0.1` and `STAGING_EDGE_HTTPS_PORT=8443`.
   Keep `WEB_BIND=127.0.0.1`, `WEB_PORT=3001`,
   `WEB_ORIGIN=https://staging.theepmo.com`,
   `PUBLIC_API_URL=https://api-staging.theepmo.com`,
   and `DEPLOYMENT_ENV=staging`.
5. The deployment's existing RC1 gate requires real **Stripe TEST** credentials
   and a restricted DB URL, stored in an approved secret store. This PR never
   provisions or reads them. Do not paste secrets into logs, issues or CI.

## Offline configuration review (safe, no network)

From the repository root **on an authorized staging-preparation machine**
with its server-owned `.env.staging` available:

```sh
node scripts/rc1-release-gate.mjs --mode staging --env-file .env.staging
node scripts/verify-staging-config.mjs --env-file .env.staging
node infra/staging/preflight.mjs --env-file .env.staging
docker compose -f docker-compose.prod.yml -f infra/staging/edge.compose.yml \
  -p pmo-staging --env-file .env.staging config --quiet
```

`config --quiet` is important: normal `docker compose config` may expand
secrets into stdout. The offline preflight checks certificate files locally,
but does not verify live TLS negotiation, DNS or external access.

## Image and runtime plan (requires separate staging authorization)

For a reviewed 40-character immutable candidate SHA, create a **clean isolated
checkout** at that SHA. On an approved build host, after authorization:

```sh
EPMO_BUILD_SHA=<EXACT_SHA> infra/staging/build-images.sh --plan
# An operator separately authorizes --build and supplies the exact confirmation.
# EPMO_BUILD_SHA=<EXACT_SHA> EPMO_STAGING_IMAGE_BUILD_CONFIRM=BUILD_STAGING:<EXACT_SHA> \
#   infra/staging/build-images.sh --build
```

The build script uses `git archive` at the exact SHA to create a temporary,
tracked-only Docker context, excluding ignored `.env.staging`, local secrets,
backups and untracked files. It refuses tracked private-key and backup-like
files, and removes the temporary context on exit. The two local images are
tagged `epmo-staging-api:sha-<SHA>` and `epmo-staging-web:sha-<SHA>` with OCI
revision labels. A future approved
staging cutover should select these with `images.compose.yml` and
`--no-build --pull never`. This is **not wired into** the existing deploy
script; review Compose override merge behavior before any actual cutover.
The edge Compose override can be added only after its TLS mounts and network
path are approved. **Never** expose `api:4000` on the host; the existing
Phase 16D staging API acceptance explicitly rejects that condition.

After an approved staging deployment, run the existing
`scripts/phase16c-verify-staging-web.mjs` and
`scripts/phase16d-verify-staging-api.mjs` against the exact healthy
`pmo-staging` containers. The public `health-probe.mjs --once` additionally
checks HTTPS identity and anonymous denial; it does not exercise paid flows.
No probe or Docker command has been executed against staging by this PR.

## Monitoring plan

The optional `infra/staging/systemd/epmo-staging-health.service` and
`.timer` run a GET-only probe every five minutes after an operator installs
and enables them. It writes sanitized status names/booleans to journald, no
response bodies, tokens or customer data. Configure a separate approved
external alert sink and off-host uptime check: a local timer cannot detect
total host or network failure. Do not install or enable the unit in this batch.

## Backup, isolated restore and rollback

The safe pre-migration sequence **after separate staging approval** is:
`infra/backup-db.sh staging`, then
`infra/staging/verify-backup.sh staging <ARCHIVE>`, then
`infra/rehearse-db-restore.sh staging <ARCHIVE>`, then the existing
`infra/bootstrap-db.sh staging` migration path. The restore rehearsal creates
a **temporary staging-only** database and removes it; it never restores over
the source database. Retain encrypted, access-controlled backups outside the
deployment tree and rehearse off-host recovery before release acceptance.
The checksum/TOC check is **not** equivalent to a successful restore.

Application rollback can be prepared without Docker access:

```sh
EPMO_EXPECTED_CURRENT_SHA=<CURRENT_SHA> EPMO_ROLLBACK_SHA=<PREVIOUS_SHA> \
  bash infra/staging/rollback-app.sh --plan
```

Execution is **not authorized by this PR**. The guarded `--execute` path
requires an isolated `the-epmo-staging` checkout, server-owned staging env,
both current container labels matching `CURRENT_SHA`, both locally cached
previous images labelled `PREVIOUS_SHA`, and a separate exact confirmation
`EPMO_STAGING_ROLLBACK_CONFIRM=ROLLBACK_STAGING:<CURRENT_SHA>:<PREVIOUS_SHA>`.
It never pulls images, runs SQL, drops databases or restores a backup.
It recreates API then web, checks container health and invokes the existing
read-only staging smoke tests. It cannot safely reverse incompatible schema
migrations; those require a separately reviewed database recovery procedure.

**Known rollback limitation:** the current legacy `infra/deploy.sh` build
path does not label images with immutable revision SHAs. Until the approved
staging cutover uses labelled images, the rollback script deliberately refuses
to execute. Do not bypass the revision checks.

## Release blockers and handoff

- **P0-01:** final integrated candidate SHA and exact-SHA CI acceptance.
- **P0-02:** independent restricted-role staging tenant RLS acceptance.
- **P0-03:** actual Stripe TEST checkout, signed webhook, replay, dunning and
  cancellation receipts (no live billing).
- **P0-04:** isolated two-user Microsoft Entra consent/refresh/revoke receipts.
- **P0-05:** real staging encrypted backup, isolated restore and rollback drill.
- **P0-06:** public HTTPS DNS/TLS, email, bilingual RTL/mobile browser UAT,
  legal/pricing/support sign-off and external monitoring.

**Release decision: NO-GO.** Review-only code, no host/DNS/secrets/database
changes, no staging or production deployment, no merge. Staging readiness
requires independently reviewed runtime evidence on one exact SHA.

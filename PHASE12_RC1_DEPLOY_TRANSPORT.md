# The EPMO RC1 — Secure Staging Deployment Checkpoint

- Explicit `EPMO_DEPLOY_HOST` required; no legacy IP fallback.
- SSH in batch mode with strict host-key verification; optional configured key.
- `staging` deployment option added, using the isolated Compose project `pmo-staging`.
- RC1 configuration preflight is required remotely before migrations.
- Health polling is bounded to 60 attempts with failure diagnostics.
- Server secrets (`.env` and `.env.*`) are excluded from rsync.
- Six dependency-free tests verify bash syntax, negative conditions, and mock staging command flow.

Run: `node --test scripts/rc1-safe-deploy.test.mjs`

Deployment requirements: SSH/rsync, trusted server host key, staging DNS/TLS,
server-managed `.env.staging`, Docker Compose, registry/package access,
PostgreSQL, Redis and Stripe test credentials.

**Not yet verified:** Real remote deployment, build, database migrations, Stripe
webhook and tenant security checks. Do not declare production ready.

## Follow-up safety checkpoint

The remote directory and server-owned environment file are checked **before**
any `rsync --delete`, which avoids copying files to an unprepared target.
The default production path is `/opt/the-epmo` (legacy installs must explicitly
set `EPMO_DEPLOY_DIR`); staging uses `/opt/the-epmo-staging`.
`infra/sync-catalogue.sh` now requires `EPMO_DEPLOY_HOST`, enforces SSH host
verification, and supports staging without any baked server IP or key path.
Database bootstrap now uses a bounded PostgreSQL wait, verifies SQL ledger
completeness, and enforces the financial RLS assertion after applying policies.
See `PHASE12_RC1_STAGING_ACCEPTANCE_HANDOFF.md` for remaining live acceptance.

# The EPMO — Phase 16F: Deployment Destination Isolation

## Purpose

This increment closes a destructive-deployment risk: the `EPMO_DEPLOY_DIR` override used to accept `/`, a parent directory, or a directory belonging to another environment. Because `infra/deploy.sh` uses `rsync --delete`, a mistaken directory could delete unrelated server files.

## Changes

- `infra/deploy.sh`: requires the selected destination's final directory name to match the requested mode (`the-epmo` for `prod`, `the-epmo-staging` for `staging`, `the-epmo-dev` for `dev`); rejects `/`, traversal, dot components, doubled/trailing slashes, and mismatched environment directories.
- `infra/deploy.sh`: remote preflight uses `realpath -e` to require that the checked-out directory resolves exactly to the selected absolute path. This blocks symlinks in the directory or its parent chain before `rsync --delete` begins. A missing `realpath` utility blocks deployment rather than weakening the protection.
- `infra/sync-catalogue.sh`: enforces the same environment-specific destination policy and canonical remote path before changing the module catalogue.
- `scripts/phase16f-deployment-target-isolation.test.mjs`: 8 regression tests covering unsafe paths, cross-environment targets, a valid custom staging checkout, and denial before rsync when the remote prerequisite fails.

## Allowed directory examples

- `staging`: `/opt/the-epmo-staging` or `/srv/epmo/the-epmo-staging`
- `prod`: `/opt/the-epmo` or `/srv/epmo/the-epmo`
- `dev`: `/opt/the-epmo-dev` or `/srv/epmo/the-epmo-dev`

Do not use a symlink for any component of the deployed directory path. The remote server must supply GNU `realpath` and an SSH host key trusted by the deployment operator. Keep secrets in remote `.env.*` files, never in the release ZIP.

## Reproduction

```bash
node --test scripts/phase16f-deployment-target-isolation.test.mjs
npm run test:offline
node scripts/verify-release-static.mjs
node scripts/verify-migration-chain.mjs
bash -n infra/deploy.sh infra/sync-catalogue.sh
```

## Verification (this environment)

- Targeted destination tests: 8/8 passed.
- Full dependency-free suite: 559/559 passed.
- Static release-check groups: 8/8 passed.
- Migration definitions: 18 ordered SQL files verified.
- Bash syntax: passed.
- ZIP integrity: passed.

**Not executed:** full application build, live server deployment, PostgreSQL migration/restore, authenticated tenant-isolation tests against a live API, Stripe test-mode payment, Amazon SES delivery, and Arabic/English browser UAT. No production approval is claimed. Next meaningful milestone requires connection to a real staging server with Docker, PostgreSQL, dependencies and appropriately stored test credentials.

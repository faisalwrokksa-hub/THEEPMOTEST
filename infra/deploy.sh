#!/usr/bin/env bash
# Verified deploy transport for The EPMO. No default server, trust bypass,
# SSH key path, or embedded customer credentials.
#
# Usage:
#   EPMO_DEPLOY_HOST=deploy@staging.example.com infra/deploy.sh staging
#   EPMO_DEPLOY_HOST=deploy@production.example.com infra/deploy.sh prod
# Optional: EPMO_DEPLOY_SSH_KEY=/path/to/key, EPMO_DEPLOY_DIR=/opt/the-epmo
# Servers must already have a pinned/trusted SSH host key in known_hosts.
set -euo pipefail

MODE=${1:-}
case "$MODE" in
  prod)    DIR=/opt/the-epmo;       PROJECT=pmo-prod;      ENVFILE=.env.prod ;;
  staging) DIR=/opt/the-epmo-staging; PROJECT=pmo-staging; ENVFILE=.env.staging ;;
  dev)     DIR=/opt/the-epmo-dev;   PROJECT=align360-dev;  ENVFILE=.env.dev ;;
  *) echo 'Usage: infra/deploy.sh <staging|dev|prod>' >&2; exit 2 ;;
esac

# Explicit host prevents accidentally deploying a new product to a legacy IP.
HOST=${EPMO_DEPLOY_HOST:-}
if [[ -z "$HOST" || ! "$HOST" =~ ^[a-zA-Z0-9_.@-]+$ ]]; then
  echo 'BLOCKED: set EPMO_DEPLOY_HOST to a trusted user@hostname (no default).' >&2
  exit 2
fi
# Never let a staging/dev command point at a production checkout (or /).
# --delete in deploy.sh makes an incorrect directory particularly dangerous.
# Custom directories may use a different absolute parent but must retain the
# environment-specific last component. Reject dot components, // and trailing /.
case "$MODE" in
  staging) EXPECTED_DIRNAME=the-epmo-staging ;;
  prod) EXPECTED_DIRNAME=the-epmo ;;
  dev) EXPECTED_DIRNAME=the-epmo-dev ;;
esac
DIR=${EPMO_DEPLOY_DIR:-$DIR}
if [[ ! "$DIR" =~ ^/([a-zA-Z0-9_-]+/)*${EXPECTED_DIRNAME}$ ]]; then
  echo "BLOCKED: EPMO_DEPLOY_DIR must be an absolute directory ending in /${EXPECTED_DIRNAME} (mode: $MODE)." >&2
  exit 2
fi

SSH_CMD=(ssh -o BatchMode=yes -o StrictHostKeyChecking=yes)
if [[ -n "${EPMO_DEPLOY_SSH_KEY:-}" ]]; then
  [[ -f "$EPMO_DEPLOY_SSH_KEY" ]] || { echo 'BLOCKED: SSH identity file does not exist.' >&2; exit 2; }
  SSH_CMD+=(-i "$EPMO_DEPLOY_SSH_KEY")
fi
# rsync -e accepts a command string. Quote each argument to preserve paths.
printf -v SSH_FOR_RSYNC '%q ' "${SSH_CMD[@]}"
ssh_remote() { "${SSH_CMD[@]}" "$HOST" "$1"; }

# The production deploy must be verified locally before files are copied.
if [[ "$MODE" == prod ]]; then
  command -v pnpm >/dev/null || { echo 'BLOCKED: pnpm is required for production verification.' >&2; exit 1; }
  pnpm -s verify
fi

# Fail before rsync --delete if the remote environment has not been prepared.
# Environment files are owned by the server and excluded from rsync, so they
# must already exist. This check also validates SSH trust/connectivity before
# writing to the destination; the complete RC1 preflight runs after sync.
# A symlink in any path component could redirect --delete into a different tree.
# Require realpath to resolve to the exact requested absolute directory.
if ! ssh_remote "test -d '$DIR' && test \"\$(realpath -e '$DIR')\" = '$DIR' && test -r '$DIR/$ENVFILE' && command -v docker >/dev/null && command -v node >/dev/null"; then
  echo "BLOCKED: remote $MODE destination, $ENVFILE, Docker, or Node.js is not ready. No files copied." >&2
  exit 1
fi

echo "Deploying $MODE to $HOST:$DIR"
# Secrets are server-managed. Never copy *.env or .git to a destination.
rsync -az --delete --no-owner --no-group \
  --exclude node_modules --exclude .next --exclude .next-prod --exclude dist \
  --exclude '.env' --exclude '.env.*' --exclude .git --exclude .DS_Store \
  -e "$SSH_FOR_RSYNC" ./ "$HOST:$DIR/"

COMPOSE="docker compose -f docker-compose.prod.yml -p $PROJECT --env-file $ENVFILE"
if [[ "$MODE" == dev ]]; then
  COMPOSE="docker compose -f docker-compose.prod.yml -f docker-compose.dev-server.yml -p $PROJECT --env-file $ENVFILE"
else
  # Must fail before any migration or container start if remote credentials,
  # Stripe deployment mode, or domain configuration are unsafe.
  ssh_remote "cd '$DIR' && node scripts/rc1-release-gate.mjs --mode '$([[ $MODE == prod ]] && echo production || echo staging)' --env-file '$ENVFILE'"
fi

# Build BEFORE changing the database. A failed image build must leave the
# currently running application and schema untouched.
ssh_remote "cd '$DIR' && $COMPOSE build api web"
# Bring up dependencies for the backup and migration; do not start new API/web
# containers until both operations succeed.
ssh_remote "cd '$DIR' && $COMPOSE up -d postgres redis"
if [[ "$MODE" == staging || "$MODE" == prod ]]; then
  # Fail closed: no verified pre-migration dump, no schema upgrade.
  # Backups live OUTSIDE the rsync --delete deployment path.
  if ! backup_result=$(ssh_remote "cd '$DIR' && infra/backup-db.sh '$MODE'"); then
    echo 'BLOCKED: mandatory pre-migration backup failed' >&2
    exit 1
  fi
  printf '%s\n' "$backup_result"
  if [[ "$MODE" == staging ]]; then
    # Prove backup restoration on an isolated staging database before changing
    # the real schema. Accept only the path emitted by the successful backup.
    backup_path=$(printf '%s\n' "$backup_result" | sed -n 's/^PASS: verified pre-migration PostgreSQL backup: //p')
    if [[ ! "$backup_path" =~ ^/[a-zA-Z0-9_./-]+$ || "$backup_path" != */epmo-staging-*.dump ]]; then
      echo 'BLOCKED: backup command did not return a safe staging archive path' >&2
      exit 1
    fi
    ssh_remote "cd '$DIR' && infra/rehearse-db-restore.sh staging '$backup_path'"
  fi
fi
ssh_remote "cd '$DIR' && infra/bootstrap-db.sh '$MODE'"
ssh_remote "cd '$DIR' && $COMPOSE up -d api web"

# Never spin forever on an unhealthy deployment. Expose useful logs on failure.
ssh_remote "cd '$DIR' && \
  ready=0; \
  for attempt in \$(seq 1 60); do \
    container=\$($COMPOSE ps -q web); \
    if [ -n \"\$container\" ]; then \
      status=\$(docker inspect -f '{{.State.Health.Status}}' \"\$container\" 2>/dev/null || true); \
      if [ \"\$status\" = healthy ]; then ready=1; break; fi; \
      if [ \"\$status\" = unhealthy ]; then break; fi; \
    fi; \
    sleep 3; \
  done; \
  if [ \"\$ready\" -ne 1 ]; then \
    echo 'BLOCKED: web did not become healthy within the deployment window' >&2; \
    $COMPOSE ps >&2; \
    $COMPOSE logs --tail 50 web api >&2; \
    exit 1; \
  fi"
# A healthy container alone does not prove that Arabic/English sign-in works
# or that anonymous users cannot access protected pages. Only check staging
# on the localhost port mapped to THIS Compose web container, never a public
# URL or a pre-existing unrelated process. A failed check blocks deploy success.
if [[ "$MODE" == staging ]]; then
  ssh_remote "cd '$DIR' && container=\$($COMPOSE ps -q web); \
    test -n \"\$container\" && node scripts/phase16c-verify-staging-web.mjs --env-file '$ENVFILE' --container \"\$container\""
fi
# Also attest that the ACTUAL healthy staging API container is using production
# authentication settings, and that billing/platform endpoints reject anonymous
# requests and forged tenant headers. Run probes inside the private container,
# never expose its API port on the host.
if [[ "$MODE" == staging ]]; then
  ssh_remote "cd '$DIR' && container=\$($COMPOSE ps -q api); \
    test -n \"\$container\" && node scripts/phase16d-verify-staging-api.mjs --env-file '$ENVFILE' --container \"\$container\""
fi
echo "PASS: $MODE web container healthy on $HOST"

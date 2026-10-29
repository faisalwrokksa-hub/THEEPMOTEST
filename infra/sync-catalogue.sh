#!/usr/bin/env bash
# Sync code-owned module definitions to an explicitly selected EPMO environment.
# No baked hosts, keys, or silent production defaults.
#
# EPMO_DEPLOY_HOST=deploy@staging.example.org infra/sync-catalogue.sh staging
# EPMO_DEPLOY_HOST=deploy@prod.example.org infra/sync-catalogue.sh prod
# Optional: EPMO_DEPLOY_SSH_KEY=/trusted/private/key
#           EPMO_DEPLOY_DIR=/approved/remote/directory
set -euo pipefail

ENV_NAME=${1:-}
case "$ENV_NAME" in
  staging) DIR=/opt/the-epmo-staging; PROJECT=pmo-staging; ENVFILE=.env.staging; FILES=(-f docker-compose.prod.yml) ;;
  prod)    DIR=/opt/the-epmo;         PROJECT=pmo-prod;    ENVFILE=.env.prod;    FILES=(-f docker-compose.prod.yml) ;;
  dev)     DIR=/opt/the-epmo-dev;     PROJECT=align360-dev; ENVFILE=.env.dev;
           FILES=(-f docker-compose.prod.yml -f docker-compose.dev-server.yml) ;;
  *) echo 'Usage: infra/sync-catalogue.sh <staging|dev|prod>' >&2; exit 2 ;;
esac
HOST=${EPMO_DEPLOY_HOST:-}
if [[ -z "$HOST" || ! "$HOST" =~ ^[a-zA-Z0-9_.@-]+$ ]]; then
  echo 'BLOCKED: EPMO_DEPLOY_HOST must be an explicit trusted user@host.' >&2
  exit 2
fi
# Never let a staging/dev command point at a production checkout (or /).
# --delete in deploy.sh makes an incorrect directory particularly dangerous.
# Custom directories may use a different absolute parent but must retain the
# environment-specific last component. Reject dot components, // and trailing /.
case "$ENV_NAME" in
  staging) EXPECTED_DIRNAME=the-epmo-staging ;;
  prod) EXPECTED_DIRNAME=the-epmo ;;
  dev) EXPECTED_DIRNAME=the-epmo-dev ;;
esac
DIR=${EPMO_DEPLOY_DIR:-$DIR}
if [[ ! "$DIR" =~ ^/([a-zA-Z0-9_-]+/)*${EXPECTED_DIRNAME}$ ]]; then
  echo "BLOCKED: EPMO_DEPLOY_DIR must be an absolute directory ending in /${EXPECTED_DIRNAME} (mode: $ENV_NAME)." >&2
  exit 2
fi
SSH_CMD=(ssh -o BatchMode=yes -o StrictHostKeyChecking=yes)
if [[ -n "${EPMO_DEPLOY_SSH_KEY:-}" ]]; then
  [[ -f "$EPMO_DEPLOY_SSH_KEY" ]] || { echo 'BLOCKED: SSH key not found.' >&2; exit 2; }
  SSH_CMD+=(-i "$EPMO_DEPLOY_SSH_KEY")
fi
command -v pnpm >/dev/null || { echo 'BLOCKED: pnpm is required to generate module SQL.' >&2; exit 1; }
# No code or secret env-file copying. The remote env must already be prepared.
# The remote command is constant except for validated paths and known options.
COMPOSE="docker compose ${FILES[*]} -p $PROJECT --env-file $ENVFILE"
pnpm --silent --filter @pmo/db modules:sql \
  | "${SSH_CMD[@]}" "$HOST" "test -d '$DIR' && test \"\$(realpath -e '$DIR')\" = '$DIR' && cd '$DIR' && test -r '$ENVFILE' && set -a && . './$ENVFILE' && set +a && \
      $COMPOSE exec -T postgres psql -v ON_ERROR_STOP=1 -q -U \"\$PG_USER\" -d \"\${PG_DB:-pmo}\""
echo "PASS: module catalogue synchronized to explicitly selected $ENV_NAME host."

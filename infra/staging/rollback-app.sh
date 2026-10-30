#!/usr/bin/env bash
# Staging application-image rollback ONLY. Never changes PostgreSQL schema.
# Defaults to a no-Docker plan. Execute requires explicit per-action confirmation.
set -euo pipefail
umask 077

MODE=${1:-}
if [[ $# -ne 1 || ( "$MODE" != '--plan' && "$MODE" != '--execute' ) ]]; then
  echo 'Usage: EPMO_EXPECTED_CURRENT_SHA=... EPMO_ROLLBACK_SHA=... infra/staging/rollback-app.sh --plan|--execute' >&2
  exit 2
fi
CURRENT=${EPMO_EXPECTED_CURRENT_SHA:-}
TARGET=${EPMO_ROLLBACK_SHA:-}
if [[ ! "$CURRENT" =~ ^[0-9a-f]{40}$ || ! "$TARGET" =~ ^[0-9a-f]{40}$ || "$CURRENT" == "$TARGET" ]]; then
  echo 'BLOCKED: provide distinct exact lowercase 40-character current and target SHAs' >&2
  exit 2
fi
API_IMAGE="epmo-staging-api:sha-$TARGET"
WEB_IMAGE="epmo-staging-web:sha-$TARGET"
if [[ "$MODE" == '--plan' ]]; then
  printf 'PLAN ONLY: staging app rollback from %s to %s\n' "$CURRENT" "$TARGET"
  printf 'Requires locally built, revision-labeled images: %s and %s\n' "$API_IMAGE" "$WEB_IMAGE"
  echo 'Preflight: verify staging-only checkout, both container and image revision labels, and exact confirmation.'
  echo 'Execution: recreate API, wait for healthy; recreate web, wait for healthy; run staging web/API smoke.'
  echo 'No database restore, schema downgrade, network exposure, DNS change, or remote image pull.'
  exit 0
fi

# The exact confirmation must be supplied by an authorized operator for this
# one staging rollback. Ordinary automation must never set it.
if [[ "${EPMO_STAGING_ROLLBACK_CONFIRM:-}" != "ROLLBACK_STAGING:$CURRENT:$TARGET" ]]; then
  echo 'BLOCKED: separate action-specific staging rollback confirmation is required' >&2
  exit 2
fi
if [[ "$(basename "$(pwd -P)")" != 'the-epmo-staging' || ! -r .env.staging ||
      ! -f docker-compose.prod.yml || ! -f infra/staging/rollback.compose.yml ]]; then
  echo 'BLOCKED: must execute from the isolated staging checkout with its server-owned env file' >&2
  exit 2
fi
if ! grep -Eq '^DEPLOYMENT_ENV=staging[[:space:]]*$' .env.staging; then
  echo 'BLOCKED: environment must explicitly be staging' >&2
  exit 2
fi
command -v docker >/dev/null || { echo 'BLOCKED: Docker not available' >&2; exit 1; }
command -v node >/dev/null || { echo 'BLOCKED: Node.js not available' >&2; exit 1; }

base=(docker compose -f docker-compose.prod.yml -p pmo-staging --env-file .env.staging)
rollback=(docker compose -f docker-compose.prod.yml -f infra/staging/rollback.compose.yml -p pmo-staging --env-file .env.staging)
container_label() {
  docker inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$1"
}
image_label() {
  docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$1"
}
attest_container() {
  local id=$1 service=$2
  [[ -n "$id" ]] || { echo "BLOCKED: missing running staging $service container" >&2; exit 1; }
  [[ "$(docker inspect --format '{{index .Config.Labels "com.docker.compose.project"}}' "$id")" == 'pmo-staging' &&
     "$(docker inspect --format '{{index .Config.Labels "com.docker.compose.service"}}' "$id")" == "$service" ]] ||
    { echo 'BLOCKED: Docker container is not part of the requested staging service' >&2; exit 1; }
}
api_id=$("${base[@]}" ps -q api)
web_id=$("${base[@]}" ps -q web)
attest_container "$api_id" api
attest_container "$web_id" web
if [[ "$(container_label "$api_id")" != "$CURRENT" ||
      "$(container_label "$web_id")" != "$CURRENT" ]]; then
  echo 'BLOCKED: current API/web revision labels do not match the expected current SHA' >&2
  exit 1
fi
if [[ "$(image_label "$API_IMAGE")" != "$TARGET" ||
      "$(image_label "$WEB_IMAGE")" != "$TARGET" ]]; then
  echo 'BLOCKED: locally cached rollback images do not attest the requested target SHA' >&2
  exit 1
fi
wait_healthy() {
  local service=$1 id status
  for attempt in $(seq 1 40); do
    id=$("${base[@]}" ps -q "$service")
    if [[ -n "$id" ]]; then
      status=$(docker inspect --format '{{.State.Health.Status}}' "$id" 2>/dev/null || true)
      [[ "$status" == healthy ]] && return 0
      [[ "$status" == unhealthy ]] && break
    fi
    sleep 3
  done
  echo "BLOCKED: staging $service did not become healthy after image rollback" >&2
  return 1
}
echo 'Starting authorized staging app-image rollback (no database changes).'
"${rollback[@]}" up -d --no-build --pull never --no-deps --force-recreate api
wait_healthy api
"${rollback[@]}" up -d --no-build --pull never --no-deps --force-recreate web
wait_healthy web
api_id=$("${base[@]}" ps -q api)
web_id=$("${base[@]}" ps -q web)
attest_container "$api_id" api
attest_container "$web_id" web
[[ "$(container_label "$api_id")" == "$TARGET" &&
   "$(container_label "$web_id")" == "$TARGET" ]] ||
  { echo 'BLOCKED: resulting containers do not attest target SHA' >&2; exit 1; }
node scripts/phase16c-verify-staging-web.mjs --env-file .env.staging --container "$web_id"
node scripts/phase16d-verify-staging-api.mjs --env-file .env.staging --container "$api_id"
printf 'PASS: staging app-image rollback verified on exact SHA %s (DB schema unchanged)\n' "$TARGET"

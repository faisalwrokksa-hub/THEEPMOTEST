#!/usr/bin/env bash
# Local development only. Refuse production/staging contexts before invoking Docker.
set -euo pipefail
operation="${1:-}"
if [[ "$#" -ne 1 || ( "$operation" != up && "$operation" != down && "$operation" != rls ) ]]; then
  echo 'BLOCKED: usage: dev-infra-guard.sh up|down|rls' >&2
  exit 2
fi
if [[ -n "${DEPLOYMENT_ENV:-}" && "${DEPLOYMENT_ENV}" != development && "${DEPLOYMENT_ENV}" != dev && "${DEPLOYMENT_ENV}" != local ]]; then
  echo 'BLOCKED: development compose cannot run under a nondevelopment deployment' >&2
  exit 2
fi
if [[ "${NODE_ENV:-}" == production ]]; then
  echo 'BLOCKED: development compose cannot run with NODE_ENV=production' >&2
  exit 2
fi
for key in EPMO_DEPLOYMENT_PROFILE EPMO_DEPLOYMENT_ID EPMO_DEPLOYMENT_REGION EPMO_DEPLOYMENT_API_ORIGIN COMPOSE_FILE COMPOSE_PROJECT_NAME DOCKER_TLS_VERIFY DOCKER_CERT_PATH; do
  if [[ -n "${!key:-}" ]]; then
    echo "BLOCKED: unset $key before local development infrastructure operations" >&2
    exit 2
  fi
done
if [[ -n "${DOCKER_HOST:-}" && "${DOCKER_HOST}" != unix:///var/run/docker.sock ]]; then
  echo 'BLOCKED: Docker endpoint is not the default local Unix socket' >&2
  exit 2
fi
if [[ -n "${DOCKER_CONTEXT:-}" && "${DOCKER_CONTEXT}" != default ]]; then
  echo 'BLOCKED: nondefault Docker context' >&2
  exit 2
fi
command -v docker >/dev/null || { echo 'BLOCKED: Docker CLI unavailable' >&2; exit 2; }
# Environment variables alone do not reveal the active Docker context; inspect it.
context="$(docker context show 2>/dev/null)" || { echo 'BLOCKED: Docker context inspection failed' >&2; exit 2; }
[[ "$context" == default ]] || { echo 'BLOCKED: active Docker context is not default' >&2; exit 2; }
endpoint="$(docker context inspect default --format '{{ (index .Endpoints "docker").Host }}' 2>/dev/null)" || { echo 'BLOCKED: Docker endpoint inspection failed' >&2; exit 2; }
[[ "$endpoint" == unix:///var/run/docker.sock ]] || { echo 'BLOCKED: active Docker endpoint is not the local default socket' >&2; exit 2; }
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
cd "$root"
if [[ "$operation" == rls ]]; then
  # Resolve the PostgreSQL service by the pinned Compose project, never by a
  # global container name or a caller-controlled PMO_PG_CONTAINER override.
  exec docker compose --project-name pmo-dev --file "$root/docker-compose.yml" exec -T postgres psql -X -v ON_ERROR_STOP=1 -U postgres -d pmo
fi
if [[ "$operation" == up ]]; then
  exec docker compose --project-name pmo-dev --file "$root/docker-compose.yml" up -d
fi
exec docker compose --project-name pmo-dev --file "$root/docker-compose.yml" down

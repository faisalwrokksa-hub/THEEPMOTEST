#!/usr/bin/env bash
# psql is not required on the host — run it inside the postgres container.
set -euo pipefail
CONTAINER="${PMO_PG_CONTAINER:-pmo-postgres}"
if ! docker ps --format '{{.Names}}' | grep -qx "${CONTAINER}"; then
  echo "error: container '${CONTAINER}' is not running. Start it with: pnpm infra:up" >&2
  exit 1
fi
echo "Applying RLS policies to ${CONTAINER}..."
docker exec -i "${CONTAINER}" psql -v ON_ERROR_STOP=1 -U postgres -d pmo \
  < "$(dirname "$0")/../sql/rls.sql"
echo "RLS applied."

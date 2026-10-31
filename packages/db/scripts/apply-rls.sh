#!/usr/bin/env bash
# Development-only RLS policy application. Never use global container names:
# S23 Compose assigns a project-scoped name and the caller must not override it.
set -Eeuo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd -P)"
# The guard rejects staging/production and remote Docker contexts before
# invoking the pinned pmo-dev PostgreSQL service. -T keeps stdin as SQL.
exec bash "$root/scripts/dev-infra-guard.sh" rls < "$root/packages/db/sql/rls.sql"

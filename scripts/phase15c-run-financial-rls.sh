#!/usr/bin/env bash
# Phase 15C: live, read-only financial RLS acceptance against disposable CI DB.
# Run after authenticated billing acceptance seeds independent tenant invoices.
set -euo pipefail

if [[ "${NODE_ENV:-}" != "test" || "${PHASE15_BILLING_ACCEPTANCE:-}" != "true" || \
  "${PHASE15_ACCEPT_DISPOSABLE_DB:-}" != "YES_RESEED_DISPOSABLE_TEST_DATABASE" ]]; then
  echo 'BLOCKED: Phase 15C financial RLS check requires explicit disposable-test authorization' >&2
  exit 1
fi
if [[ -z "${DATABASE_URL_ADMIN:-}" || -z "${DATABASE_URL:-}" ]]; then
  echo 'BLOCKED: both database roles must be configured' >&2
  exit 1
fi

# Identifiers are UUIDs from known, fixed seed slugs. Never accept arbitrary SQL.
get_tenant_id() {
  local slug="$1"
  psql "$DATABASE_URL_ADMIN" -X -v ON_ERROR_STOP=1 -tAc \
    "SELECT id FROM tenants WHERE slug = '$slug'"
}
TENANT_A="$(get_tenant_id 'al-nakheel')"
TENANT_B="$(get_tenant_id 'nexa')"
if [[ -z "$TENANT_A" || -z "$TENANT_B" || "$TENANT_A" == "$TENANT_B" ]]; then
  echo 'BLOCKED: two different seeded tenants are required' >&2
  exit 1
fi

# DEPLOYMENT_ENV is narrowly scoped to the RLS audit, which intentionally
# requires staging semantics and rejects production deployment mode.
DEPLOYMENT_ENV=staging \
  STRIPE_DB_TENANT_A_ID="$TENANT_A" \
  STRIPE_DB_TENANT_B_ID="$TENANT_B" \
  node scripts/stripe-db-rls-audit.mjs

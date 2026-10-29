#!/usr/bin/env bash
# First-run database setup. Run ON THE SERVER, from the environment's directory:
#
#   cd /opt/the-epmo-dev && infra/bootstrap-db.sh dev
#   cd /opt/the-epmo     && infra/bootstrap-db.sh prod
#
#   1. create the RLS-bound application role with the password from DATABASE_URL
#   2. apply the generated schema migration        (admin rights needed)
#   3. apply the row-level-security policies       (must follow the schema)
#
# Safe to re-run: every step is idempotent.
set -euo pipefail
case "${1:-prod}" in
  prod) PROJECT=pmo-prod;     ENVFILE=.env.prod; FILES=(-f docker-compose.prod.yml) ;;
  staging) PROJECT=pmo-staging; ENVFILE=.env.staging; FILES=(-f docker-compose.prod.yml) ;;
  dev)  PROJECT=align360-dev; ENVFILE=.env.dev;
        FILES=(-f docker-compose.prod.yml -f docker-compose.dev-server.yml) ;;
  *) echo "usage: $0 <dev|staging|prod>" >&2; exit 2 ;;
esac
# Verify both the migration order and the pinned SQL file contents BEFORE
# connecting to PostgreSQL or changing the application role. The same guard
# runs in CI's SQL-ledger runner; staging must not silently skip it.
command -v node >/dev/null || { echo 'BLOCKED: Node.js required for migration integrity verification.' >&2; exit 1; }
node scripts/verify-migration-chain.mjs || {
  echo 'BLOCKED: migration chain or SQL content differs from the pinned release manifest.' >&2
  exit 1
}
dc() { docker compose "${FILES[@]}" -p "$PROJECT" --env-file "$ENVFILE" "$@"; }

set -a; . "./$ENVFILE"; set +a
# Use the URL parser rather than a regex: generated database passwords can be
# percent-encoded (including @, : and SQL quotes). Never log the password.
APP_PW=$(node -e 'const u = new URL(process.env.DATABASE_URL || ""); if (u.username !== "pmo_app" || !u.password) process.exit(1); process.stdout.write(decodeURIComponent(u.password))') || {
  echo "DATABASE_URL must supply a pmo_app application password" >&2; exit 1;
}
[ "${#APP_PW}" -ge 16 ] || { echo "Application password must be at least 16 characters" >&2; exit 1; }
# Escape SQL string literals to prevent role password injection. This value is
# sent on stdin to psql, never on the command line or in server logs.
APP_PW_SQL=$(printf '%s' "$APP_PW" | sed "s/'/''/g")

echo "Waiting for postgres (maximum 120 seconds)…"
pg_ready=0
for attempt in $(seq 1 60); do
  if dc exec -T postgres pg_isready -U "$PG_USER" -d "${PG_DB:-pmo}" >/dev/null 2>&1; then
    pg_ready=1
    break
  fi
  sleep 2
done
if [ "$pg_ready" -ne 1 ]; then
  echo 'BLOCKED: PostgreSQL did not become ready within 120 seconds. No migrations applied.' >&2
  exit 1
fi

# Never mix the legacy SQL ledger with Drizzle's journal on one database.
# Two independent histories can reapply DDL and corrupt an upgraded tenant.
if [ "$(dc exec -T postgres psql -tA -v ON_ERROR_STOP=1 -U "$PG_USER" -d "${PG_DB:-pmo}" \
    -c "SELECT CASE WHEN to_regclass('drizzle.__drizzle_migrations') IS NULL THEN 0 ELSE 1 END" </dev/null | tr -d '[:space:]')" != '0' ]; then
  echo 'BLOCKED: Drizzle migration journal already exists. Use the Drizzle migration path; do not mix ledgers.' >&2
  exit 1
fi

echo "1/3 application role"
dc exec -T postgres psql -v ON_ERROR_STOP=1 -U "$PG_USER" -d "${PG_DB:-pmo}" <<SQL
DO \$\$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pmo_app') THEN
    CREATE ROLE pmo_app LOGIN;
  END IF;
END \$\$;
-- An earlier RLS-only setup may have created pmo_app as NOLOGIN.
-- Explicit LOGIN is required even if the role already exists.
ALTER ROLE pmo_app LOGIN WITH PASSWORD '${APP_PW_SQL}';
SQL

echo "2/3 schema"
# A ledger, not `|| true`. Ignoring every error to make re-runs safe also hides
# the ones that matter — that is how a stale enum reached a fresh database
# without anyone noticing. Each file is applied once, with ON_ERROR_STOP, and a
# genuine failure stops the script.
dc exec -T postgres psql -q -v ON_ERROR_STOP=1 -U "$PG_USER" -d "${PG_DB:-pmo}" <<'SQL'
BEGIN;
SELECT pg_advisory_xact_lock(1717, 2026);
CREATE TABLE IF NOT EXISTS schema_migrations (
  filename text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);
COMMIT;
SQL
for f in packages/db/migrations/*.sql; do
  name=$(basename "$f")
  done_already=$(dc exec -T postgres psql -tA -U "$PG_USER" -d "${PG_DB:-pmo}" \
    -c "SELECT 1 FROM schema_migrations WHERE filename = '$name'" </dev/null | tr -d '[:space:]')
  if [ "$done_already" = "1" ]; then
    echo "    $name  (already applied)"
    continue
  fi
  echo "    $name"
  # The outer lookup may race another deployment. Take a transaction-wide
  # EXCLUSIVE lock on the migration ledger and re-check the row while holding
  # it. The conditional psql block then applies DDL and records its filename
  # atomically, or skips DDL when the other process committed first.
  if ! {
    printf 'BEGIN;\nLOCK TABLE public.schema_migrations IN EXCLUSIVE MODE;\n'
    printf "SELECT NOT EXISTS (SELECT 1 FROM public.schema_migrations WHERE filename = '%s') AS needs_apply \\gset\n" "$name"
    printf '\\if :needs_apply\n'
    cat "$f"
    printf "\nINSERT INTO public.schema_migrations (filename) VALUES ('%s');\n" "$name"
    printf '\\else\n\\echo SKIP: migration already applied by a concurrent runner\n\\endif\nCOMMIT;\n'
  } | dc exec -T postgres psql -q -v ON_ERROR_STOP=1 -U "$PG_USER" -d "${PG_DB:-pmo}"; then
    echo "    ^ FAILED — migration and ledger transaction rolled back; stopping." >&2
    exit 1
  fi
done

# The SQL ledger is authoritative for this deployment path. Reject missing
# or unexpected records, rather than allowing a partial or manually edited
# migration history to be mistaken for a successful release.
expected_migrations=$(for file in packages/db/migrations/*.sql; do basename "$file"; done | LC_ALL=C sort)
applied_migrations=$(dc exec -T postgres psql -tA -v ON_ERROR_STOP=1 -U "$PG_USER" -d "${PG_DB:-pmo}" \
  -c 'SELECT filename FROM schema_migrations ORDER BY filename' </dev/null)
if [ "$expected_migrations" != "$applied_migrations" ]; then
  echo 'BLOCKED: SQL migration ledger differs from the checked-out migration files.' >&2
  exit 1
fi

echo "3/3 row-level security"
dc exec -T postgres psql -q -v ON_ERROR_STOP=1 -U "$PG_USER" -d "${PG_DB:-pmo}" \
  < packages/db/sql/rls.sql >/dev/null
# A policy creation that silently omitted a financial table must block release.
dc exec -T postgres psql -q -v ON_ERROR_STOP=1 -U "$PG_USER" -d "${PG_DB:-pmo}" \
  < packages/db/sql/assert-financial-rls.sql >/dev/null
# Global users are shared across tenants. Reject accidental table-wide app-role
# UPDATE/INSERT access, especially writes to is_platform_admin and is_active.
dc exec -T postgres psql -q -v ON_ERROR_STOP=1 -U "$PG_USER" -d "${PG_DB:-pmo}" \
  < packages/db/sql/assert-global-role-privileges.sql >/dev/null

echo
dc exec -T postgres psql -tA -U "$PG_USER" -d "${PG_DB:-pmo}" -c \
  "select '  tables: '||count(*) from information_schema.tables
    where table_schema='public' and table_type='BASE TABLE';"
dc exec -T postgres psql -tA -U "$PG_USER" -d "${PG_DB:-pmo}" -c \
  "select '  rls policies: '||count(*) from pg_policies where policyname='tenant_isolation';"
echo "Done. The API can now start."

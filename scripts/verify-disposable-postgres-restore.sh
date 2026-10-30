#!/usr/bin/env bash
# Nonproduction PostgreSQL restore verification. Requires explicitly disposable target.
set -Eeuo pipefail
umask 077
: "${BACKUP_FILE:?Set BACKUP_FILE to a pg_dump custom-format archive}"
: "${RESTORE_DATABASE_URL:?Set RESTORE_DATABASE_URL for an isolated disposable database}"
[[ "${ALLOW_DISPOSABLE_RESTORE:-}" == "YES" ]] || { echo "BLOCKED: set ALLOW_DISPOSABLE_RESTORE=YES for disposable target" >&2; exit 2; }
[[ -f "$BACKUP_FILE" && -r "$BACKUP_FILE" ]] || { echo "BLOCKED: unreadable archive" >&2; exit 2; }
for tool in pg_restore psql python3; do command -v "$tool" >/dev/null || { echo "Missing $tool" >&2; exit 2; }; done
# Never print connection URL, credentials or archive contents.
# Refuse libpq environment overrides that could redirect the target.
for key in PGHOST PGHOSTADDR PGSERVICE PGSERVICEFILE PGDATABASE PGOPTIONS; do
  [[ -z "${!key:-}" ]] || { echo "BLOCKED: unset $key before a disposable restore" >&2; exit 2; }
done
# Parse PostgreSQL URI rather than matching a substring like 'localhost'.
# Query overrides, nonlocal hosts and non-disposable database names are rejected.
if ! python3 - "$RESTORE_DATABASE_URL" <<'PY'
import sys
from urllib.parse import urlsplit, unquote
try:
    u = urlsplit(sys.argv[1])
    db = unquote(u.path[1:]) if u.path.startswith('/') else ''
    valid = (u.scheme in ('postgres', 'postgresql') and
             u.hostname in ('localhost', '127.0.0.1', '::1') and
             (u.port is None or 0 < u.port < 65536) and
             not u.query and not u.fragment and bool(u.netloc) and
             db.startswith('epmo_restore_') and len(db) > len('epmo_restore_') and
             '/' not in db and all(ord(c) >= 33 for c in db))
except (ValueError, IndexError):
    valid = False
if not valid:
    print('BLOCKED: use local postgresql:// URI for an epmo_restore_* database without query overrides', file=sys.stderr)
    sys.exit(2)
PY
then exit 2; fi
pg_restore --list "$BACKUP_FILE" >/dev/null
# No --clean: require an empty isolated database, avoiding destructive overwrite.
count="$(psql "$RESTORE_DATABASE_URL" -X -A -t -v ON_ERROR_STOP=1 -c "SELECT count(*) FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%' AND c.relkind IN ('r','p','v','m','S','f')" | tr -d '[:space:]')"
[[ "$count" == "0" ]] || { echo "BLOCKED: restore target contains user relations" >&2; exit 2; }
pg_restore --exit-on-error --single-transaction --no-owner --no-acl --dbname="$RESTORE_DATABASE_URL" "$BACKUP_FILE"
psql "$RESTORE_DATABASE_URL" -X -v ON_ERROR_STOP=1 -c "SELECT count(*) AS restored_tables FROM pg_catalog.pg_tables WHERE schemaname NOT IN ('pg_catalog','information_schema');"
echo "PASS: restore command completed on explicitly disposable local database; production recovery, data integrity and RTO/RPO remain unverified."

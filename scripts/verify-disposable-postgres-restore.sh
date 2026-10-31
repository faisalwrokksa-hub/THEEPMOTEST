#!/usr/bin/env bash
# Nonproduction PostgreSQL restore verification. Requires explicitly disposable target.
set -Eeuo pipefail
umask 077
: "${BACKUP_FILE:?Set BACKUP_FILE to a pg_dump custom-format archive}"
: "${RESTORE_DATABASE_URL:?Set RESTORE_DATABASE_URL for an isolated disposable database}"
[[ "${ALLOW_DISPOSABLE_RESTORE:-}" == "YES" ]] || { echo "BLOCKED: set ALLOW_DISPOSABLE_RESTORE=YES for disposable target" >&2; exit 2; }
[[ -f "$BACKUP_FILE" && -r "$BACKUP_FILE" ]] || { echo "BLOCKED: unreadable archive" >&2; exit 2; }
for tool in pg_restore psql python3; do command -v "$tool" >/dev/null || { echo "Missing $tool" >&2; exit 2; }; done
# Never print connection URL, credentials or archive contents, including via process arguments.
# Refuse libpq environment overrides that could redirect the target.
for key in PGHOST PGHOSTADDR PGPORT PGSERVICE PGSERVICEFILE PGDATABASE PGOPTIONS; do
  [[ -z "${!key:-}" ]] || { echo "BLOCKED: unset $key before a disposable restore" >&2; exit 2; }
done
# Parse and validate once, then transfer connection parameters over a NUL-delimited pipe.
# No connection URL or password is ever placed on a subprocess command line.
# Process-substitution exit status is not relied on: require exactly five fields.
mapfile -d '' -t connection_parts < <(python3 - <<'PYURI'
import os
import sys
from urllib.parse import urlsplit, unquote
try:
    u = urlsplit(os.environ['RESTORE_DATABASE_URL'])
    db = unquote(u.path[1:]) if u.path.startswith('/') else ''
    user = unquote(u.username or '')
    password = unquote(u.password or '')
    fields = [u.hostname or '', str(u.port or 5432), user, password, db]
    valid = (u.scheme in ('postgres', 'postgresql') and
             u.hostname in ('localhost', '127.0.0.1', '::1') and
             (u.port is None or 0 < u.port < 65536) and
             not u.query and not u.fragment and bool(u.netloc) and
             db.startswith('epmo_restore_') and len(db) > len('epmo_restore_') and
             '/' not in db and all(ord(c) >= 33 for c in db) and
             all(not any(ord(c) < 32 or ord(c) == 127 for c in value) for value in fields))
except (ValueError, IndexError, KeyError):
    valid = False
if not valid:
    print('BLOCKED: use local postgresql:// URI for an epmo_restore_* database without query overrides', file=sys.stderr)
    sys.exit(2)
sys.stdout.buffer.write(('\0'.join(fields) + '\0').encode())
PYURI
)
[[ "${#connection_parts[@]}" -eq 5 ]] || { echo 'BLOCKED: invalid disposable PostgreSQL connection URI' >&2; exit 2; }
# libpq reads these environment variables; argv carries only a nonsecret database name.
export PGHOST="${connection_parts[0]}" PGPORT="${connection_parts[1]}" PGDATABASE="${connection_parts[4]}"
[[ -z "${connection_parts[2]}" ]] || export PGUSER="${connection_parts[2]}"
[[ -z "${connection_parts[3]}" ]] || export PGPASSWORD="${connection_parts[3]}"
restore_db="${connection_parts[4]}"
unset RESTORE_DATABASE_URL connection_parts
# Reject valid-but-empty or data-only archives before opening a database connection.
# A complete pg_dump custom archive has at least one TABLE definition in its TOC.
archive_toc="$(pg_restore --list "$BACKUP_FILE")"
if ! grep -Eq '^[[:space:]]*[0-9]+;[[:space:]]+[0-9]+[[:space:]]+[0-9]+[[:space:]]+TABLE[[:space:]]' <<<"$archive_toc"; then
  echo "BLOCKED: archive has no TABLE definitions; not a complete application restore" >&2
  exit 2
fi
if ! grep -Eq '^[[:space:]]*[0-9]+;[[:space:]]+[0-9]+[[:space:]]+[0-9]+[[:space:]]+TABLE DATA[[:space:]]' <<<"$archive_toc"; then
  echo "BLOCKED: archive has no TABLE DATA entries; schema-only backups cannot prove full recovery" >&2
  exit 2
fi
unset archive_toc
# No --clean: require an empty isolated database, avoiding destructive overwrite.
count="$(psql -X -A -t -v ON_ERROR_STOP=1 -c "SELECT count(*) FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%' AND c.relkind IN ('r','p','v','m','S','f')" | tr -d '[:space:]')"
[[ "$count" =~ ^[0-9]+$ && "$count" == "0" ]] || { echo "BLOCKED: restore target contains user relations or returned an invalid inventory" >&2; exit 2; }
pg_restore --exit-on-error --single-transaction --no-owner --no-acl --dbname="$restore_db" "$BACKUP_FILE"
restored_count="$(psql -X -A -t -v ON_ERROR_STOP=1 -c "SELECT count(*) FROM pg_catalog.pg_tables WHERE schemaname NOT IN ('pg_catalog','information_schema')" | tr -d '[:space:]')"
[[ "$restored_count" =~ ^[0-9]+$ && "$restored_count" -gt 0 ]] || { echo "FAIL: restore completed but no user tables were verified" >&2; exit 2; }
echo "PASS: $restored_count user tables restored into explicitly disposable local database; production recovery, data integrity and RTO/RPO remain unverified."

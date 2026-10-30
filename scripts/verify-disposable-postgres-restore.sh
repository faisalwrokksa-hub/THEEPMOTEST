#!/usr/bin/env bash
# Nonproduction PostgreSQL restore verification. Requires explicitly disposable target.
set -Eeuo pipefail
umask 077
: "${BACKUP_FILE:?Set BACKUP_FILE to a pg_dump custom-format archive}"
: "${RESTORE_DATABASE_URL:?Set RESTORE_DATABASE_URL for an isolated disposable database}"
[[ "${ALLOW_DISPOSABLE_RESTORE:-}" == "YES" ]] || { echo "BLOCKED: set ALLOW_DISPOSABLE_RESTORE=YES for disposable target" >&2; exit 2; }
[[ -f "$BACKUP_FILE" && -r "$BACKUP_FILE" ]] || { echo "BLOCKED: unreadable archive" >&2; exit 2; }
for tool in pg_restore psql; do command -v "$tool" >/dev/null || { echo "Missing $tool" >&2; exit 2; }; done
# Never print connection URL, credentials or archive contents.
case "$RESTORE_DATABASE_URL" in
  *localhost*|*127.0.0.1*|*host=localhost*|*host=127.0.0.1*) ;;
  *) echo "BLOCKED: restore target must be local disposable PostgreSQL" >&2; exit 2 ;;
esac
pg_restore --list "$BACKUP_FILE" >/dev/null
# No --clean: require an empty isolated database, avoiding destructive overwrite.
count="$(psql "$RESTORE_DATABASE_URL" -X -A -t -v ON_ERROR_STOP=1 -c "SELECT count(*) FROM pg_catalog.pg_tables WHERE schemaname NOT IN ('pg_catalog','information_schema')" | tr -d '[:space:]')"
[[ "$count" == "0" ]] || { echo "BLOCKED: restore target is not empty" >&2; exit 2; }
pg_restore --exit-on-error --single-transaction --no-owner --no-acl --dbname="$RESTORE_DATABASE_URL" "$BACKUP_FILE"
psql "$RESTORE_DATABASE_URL" -X -v ON_ERROR_STOP=1 -c "SELECT count(*) AS restored_tables FROM pg_catalog.pg_tables WHERE schemaname NOT IN ('pg_catalog','information_schema');"
echo "PASS: archive restored into disposable local database; application-level integrity and recovery time still require separate acceptance."

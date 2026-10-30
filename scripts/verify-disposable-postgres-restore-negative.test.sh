#!/usr/bin/env bash
# Offline regression: PostgreSQL restore URI must not redirect through libpq URI tricks.
set -Eeuo pipefail
script="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/verify-disposable-postgres-restore.sh"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
touch "$tmp/archive.dump"
mkdir "$tmp/bin"
for tool in pg_restore psql; do
  cat > "$tmp/bin/$tool" <<'SH'
#!/bin/sh
echo "UNEXPECTED_DATABASE_ACCESS" >&2
exit 97
SH
  chmod +x "$tmp/bin/$tool"
done
reject() {
  local url="$1" output status
  set +e
  output="$(env -u PGHOST -u PGHOSTADDR -u PGSERVICE -u PGSERVICEFILE -u PGDATABASE -u PGOPTIONS PATH="$tmp/bin:$PATH" BACKUP_FILE="$tmp/archive.dump" RESTORE_DATABASE_URL="$url" ALLOW_DISPOSABLE_RESTORE=YES bash "$script" 2>&1)"
  status=$?
  set -e
  [[ "$status" == 2 ]] || { echo "FAIL: expected blocked URI, got status $status" >&2; exit 1; }
  [[ "$output" != *UNEXPECTED_DATABASE_ACCESS* ]] || { echo "FAIL: database command invoked" >&2; exit 1; }
}
reject 'postgresql://localhost/epmo_restore_test?host=remote.example'
reject 'postgresql://localhost/production'
reject 'postgresql://remote.example/epmo_restore_test'
reject 'postgresql://localhost/epmo_restore_test#fragment'
reject 'postgresql://localhost/epmo_restore_test%2Fother'
echo 'PASS: invalid restore URIs fail before database access'

#!/usr/bin/env bash
# Offline command-stub regression; does not contact a database.
set -Eeuo pipefail
root="$(cd "$(dirname "$0")" && pwd)"
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/bin"; : > "$tmp/backup.dump"
cat > "$tmp/bin/pg_restore" <<'SH'
#!/usr/bin/env bash
echo restore >> "$STUB_LOG"
exit 0
SH
cat > "$tmp/bin/psql" <<'SH'
#!/usr/bin/env bash
echo psql >> "$STUB_LOG"
for arg in "$@"; do
  if [[ "$arg" == *"SELECT count(*) FROM pg_catalog.pg_class"* ]]; then echo 0; exit 0; fi
done
exit 0
SH
chmod +x "$tmp/bin/"*
export PATH="$tmp/bin:$PATH" BACKUP_FILE="$tmp/backup.dump" ALLOW_DISPOSABLE_RESTORE=YES STUB_LOG="$tmp/log"
run_ok() {
  : > "$STUB_LOG"
  RESTORE_DATABASE_URL="$1" bash "$root/verify-disposable-postgres-restore.sh" >"$tmp/out" 2>&1 || { cat "$tmp/out"; exit 1; }
  [[ "$(wc -l < "$STUB_LOG")" == "4" ]] || { echo "Unexpected stub calls"; exit 1; }
}
run_bad() {
  : > "$STUB_LOG"
  if RESTORE_DATABASE_URL="$1" bash "$root/verify-disposable-postgres-restore.sh" >"$tmp/out" 2>&1; then echo "Accepted unsafe URL: $1"; exit 1; fi
  [[ ! -s "$STUB_LOG" ]] || { echo "Unsafe URL reached database commands"; exit 1; }
}
run_ok 'postgresql://user:pass@localhost:5432/epmo_restore_test'
run_ok 'postgresql://user@[::1]:5432/epmo_restore_test'
run_bad 'postgresql://user@evil.example/epmo_restore_test?application_name=localhost'
run_bad 'postgresql://localhost.evil.example/epmo_restore_test'
run_bad 'postgresql://localhost/epmo_restore_test?hostaddr=8.8.8.8'
run_bad 'postgresql://localhost/postgres'
run_bad 'host=localhost dbname=epmo_restore_test'
run_bad 'postgresql://localhost/epmo_restore_'
run_bad 'postgresql://localhost/epmo_restore_test/extra'
: > "$STUB_LOG"
if PGHOSTADDR=8.8.8.8 RESTORE_DATABASE_URL='postgresql://localhost/epmo_restore_test' bash "$root/verify-disposable-postgres-restore.sh" >"$tmp/out" 2>&1; then echo 'Accepted PGHOSTADDR override'; exit 1; fi
[[ ! -s "$STUB_LOG" ]] || { echo "Unsafe environment reached database commands"; exit 1; }
echo 'PASS: disposable restore URI guards (stubbed commands only)'

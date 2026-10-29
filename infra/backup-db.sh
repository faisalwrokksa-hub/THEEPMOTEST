#!/usr/bin/env bash
# Mandatory pre-migration backup of the staging/production PostgreSQL database.
# Run on the target server from the checked-out project root. This creates a
# portable custom-format dump and validates its archive directory (NOT a restore).
# No backup directory is created inside the rsync --delete deployment tree.
set -euo pipefail
umask 077

MODE=${1:-}
case "$MODE" in
  staging) PROJECT=pmo-staging; ENVFILE=.env.staging ;;
  prod) PROJECT=pmo-prod; ENVFILE=.env.prod ;;
  *) echo 'Usage: infra/backup-db.sh <staging|prod>' >&2; exit 2 ;;
esac
[[ -r "$ENVFILE" ]] || { echo "BLOCKED: missing $ENVFILE" >&2; exit 1; }
# Matches the bootstrap script: PG_USER/PG_DB must come from server-managed env.
set -a
# shellcheck disable=SC1090
. "./$ENVFILE"
set +a
[[ -n "${PG_USER:-}" ]] || { echo 'BLOCKED: PG_USER not configured' >&2; exit 1; }

BACKUP_DIR=${EPMO_BACKUP_DIR:-${HOME:?HOME required}/the-epmo-backups/$MODE}
if [[ "$BACKUP_DIR" != /* || "$BACKUP_DIR" == *'/../'* || "$BACKUP_DIR" == *'/..' ||
      ! "$BACKUP_DIR" =~ ^/[a-zA-Z0-9_./-]+$ || -L "$BACKUP_DIR" ]]; then
  echo 'BLOCKED: EPMO_BACKUP_DIR must be a safe, non-symlink absolute path' >&2
  exit 2
fi
# Never write backups into the checked-out deployment. Deploy uses
# `rsync --delete`, which can erase files inside that tree on the next run.
# `realpath -m` resolves existing symlinked ancestors even if the final
# backup directory is not yet present. A simple string prefix is not enough.
command -v realpath >/dev/null || { echo 'BLOCKED: realpath is required for backup safety' >&2; exit 1; }
deploy_root=$(pwd -P)
backup_target=$(realpath -m -- "$BACKUP_DIR")
if [[ "$backup_target" == "$deploy_root" || "$backup_target" == "$deploy_root/"* ]]; then
  echo 'BLOCKED: backup destination is inside the deployment tree (rsync --delete risk)' >&2
  exit 2
fi
mkdir -p -- "$BACKUP_DIR"
chmod 700 -- "$BACKUP_DIR"
# Recheck after creation to catch a newly introduced symlink at the leaf.
backup_created=$(realpath -e -- "$BACKUP_DIR")
if [[ "$backup_created" == "$deploy_root" || "$backup_created" == "$deploy_root/"* ]]; then
  echo 'BLOCKED: resolved backup directory is inside the deployment tree' >&2
  exit 2
fi
command -v docker >/dev/null || { echo 'BLOCKED: Docker is required for backup' >&2; exit 1; }
command -v sha256sum >/dev/null || { echo 'BLOCKED: sha256sum is required' >&2; exit 1; }
dc() { docker compose -f docker-compose.prod.yml -p "$PROJECT" --env-file "$ENVFILE" "$@"; }

# `compose up -d postgres` can return before the server accepts connections.
# Retry for at most 120 seconds; never produce an empty backup and call it good.
ready=0
for attempt in $(seq 1 60); do
  if dc exec -T postgres pg_isready --username="$PG_USER" --dbname="${PG_DB:-pmo}" >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 2
done
[[ "$ready" == 1 ]] || { echo 'BLOCKED: PostgreSQL backup source is not ready after 120 seconds' >&2; exit 1; }

stamp=$(date -u +%Y%m%dT%H%M%SZ)
partial=$(mktemp "$BACKUP_DIR/.epmo-$MODE-$stamp.XXXXXXXX")
checksum_partial=''
cleanup() {
  rm -f -- "$partial"
  if [[ -n "$checksum_partial" ]]; then rm -f -- "$checksum_partial"; fi
}
trap cleanup EXIT
final="$BACKUP_DIR/epmo-$MODE-$stamp-${partial##*.}.dump"
[[ ! -e "$final" && ! -L "$final" && ! -e "$final.sha256" ]] || { echo 'BLOCKED: backup already exists' >&2; exit 1; }

# pg_dump failures must abort deployment (pipefail does not protect a redirected
# command from failures masked by following echo statements).
if ! dc exec -T postgres pg_dump --format=custom --no-owner --no-acl \
  --username="$PG_USER" --dbname="${PG_DB:-pmo}" > "$partial"; then
  echo 'BLOCKED: pg_dump failed; no migrations may be applied' >&2
  exit 1
fi
[[ -s "$partial" ]] || { echo 'BLOCKED: database backup is empty' >&2; exit 1; }
# Check the custom archive TOC using the same PostgreSQL major version.
# This is NOT equivalent to restoring into an isolated database.
if ! dc exec -T postgres pg_restore --list < "$partial" > /dev/null; then
  echo 'BLOCKED: pg_restore could not read the archive' >&2
  exit 1
fi
checksum_partial=$(mktemp "$BACKUP_DIR/.checksum-$MODE-$stamp.XXXXXXXX")
checksum=$(sha256sum "$partial" | cut -d' ' -f1)
printf '%s  %s\n' "$checksum" "$(basename "$final")" > "$checksum_partial"
# Rename in the same directory so an incomplete backup never appears finished.
mv -- "$partial" "$final"
mv -- "$checksum_partial" "$final.sha256"
# Verify the sidecar against the completed, renamed file before allowing SQL.
if ! (cd "$BACKUP_DIR" && sha256sum -c "$(basename "$final.sha256")" > /dev/null); then
  rm -f -- "$final" "$final.sha256"
  echo 'BLOCKED: backup checksum verification failed; no migration is permitted' >&2
  exit 1
fi
trap - EXIT
printf 'PASS: verified pre-migration PostgreSQL backup: %s\n' "$final"
printf 'NOTE: a complete restore rehearsal is still required before production approval.\n'

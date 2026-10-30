#!/usr/bin/env bash
# Read-only integrity check for a staging backup. No Docker or DB connection.
set -euo pipefail
umask 077
if [[ $# -ne 2 || "$1" != staging ]]; then
  echo 'Usage: infra/staging/verify-backup.sh staging /absolute/path/epmo-staging-YYYYMMDDTHHMMSSZ-<nonce>.dump' >&2
  exit 2
fi
archive=$2
if [[ "$archive" != /* || "$archive" == *'/../'* || "$archive" == *'/..' ||
      ! "$archive" =~ ^/[A-Za-z0-9_./-]+$ || -L "$archive" || ! -f "$archive" ]]; then
  echo 'BLOCKED: staging backup must be an absolute, regular, non-symlink file' >&2
  exit 2
fi
name=$(basename -- "$archive")
if [[ ! "$name" =~ ^epmo-staging-[0-9]{8}T[0-9]{6}Z-[A-Za-z0-9]+\.dump$ ]]; then
  echo 'BLOCKED: backup filename does not match staging backup format' >&2
  exit 2
fi
if [[ ! -f "$archive.sha256" || -L "$archive.sha256" ]]; then
  echo 'BLOCKED: missing regular checksum sidecar' >&2
  exit 1
fi
line=$(cat -- "$archive.sha256")
if [[ ! "$line" =~ ^[0-9a-f]{64}[[:space:]][[:space:]] ]] ||
    [[ "${line:66}" != "$name" ]]; then
  echo 'BLOCKED: checksum sidecar does not identify this staging archive' >&2
  exit 1
fi
command -v sha256sum >/dev/null || { echo 'BLOCKED: sha256sum required' >&2; exit 1; }
command -v pg_restore >/dev/null || { echo 'BLOCKED: pg_restore required' >&2; exit 1; }
if ! (cd "$(dirname -- "$archive")" && sha256sum -c -- "$name.sha256" >/dev/null); then
  echo 'BLOCKED: backup checksum mismatch' >&2
  exit 1
fi
if ! pg_restore --list "$archive" >/dev/null 2>&1; then
  echo 'BLOCKED: backup is not a readable PostgreSQL custom archive' >&2
  exit 1
fi
echo 'PASS: staging backup checksum and archive table-of-contents validated (no restore performed).'

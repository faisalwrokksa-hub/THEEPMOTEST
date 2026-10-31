#!/usr/bin/env bash
# CI/administrative SQL-ledger migration runner. Uses PostgreSQL's PGHOST,
# PGPORT, PGUSER, PGDATABASE and PGPASSWORD environment variables. The
# restricted application login must NEVER be used for schema changes.
# This uses the same schema_migrations ledger and ordered SQL sources as
# infra/bootstrap-db.sh; do not run Drizzle migrations on this database.
set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$ROOT"

node scripts/verify-migration-chain.mjs
command -v psql >/dev/null || { echo 'BLOCKED: postgresql-client (psql) is required.' >&2; exit 1; }
for key in PGHOST PGUSER PGDATABASE PGPASSWORD; do
  if [[ -z "${!key:-}" ]]; then
    echo "BLOCKED: $key must be configured for the administrative connection." >&2
    exit 1
  fi
done
if [[ "$PGUSER" == 'pmo_app' ]]; then
  echo 'BLOCKED: migrations require an administrator, not pmo_app.' >&2
  exit 1
fi
# -X ignores ~/.psqlrc; ON_ERROR_STOP makes every SQL error fatal.
psql_admin() { psql -X -v ON_ERROR_STOP=1 "$@"; }

journal=$(psql_admin -At -c "SELECT CASE WHEN to_regclass('drizzle.__drizzle_migrations') IS NULL THEN 0 ELSE 1 END")
if [[ "$journal" != '0' ]]; then
  echo 'BLOCKED: Drizzle migration journal exists; never mix migration ledgers.' >&2
  exit 1
fi
# Serialize first-time ledger creation too: CREATE TABLE IF NOT EXISTS alone
# can still race inside the PostgreSQL system catalogs on two new deployments.
psql_admin -q <<'SQL'
BEGIN;
SELECT pg_advisory_xact_lock(1717, 2026);
CREATE TABLE IF NOT EXISTS public.schema_migrations (
  filename text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now(),
  source_sha256 text
);
-- Existing filename-only rows remain NULL: never invent their historical bytes.
ALTER TABLE public.schema_migrations ADD COLUMN IF NOT EXISTS source_sha256 text;
COMMIT;
SQL


# Preflight the ENTIRE existing ledger before applying even the first pending
# migration. Otherwise an unattested later row could be discovered only after
# earlier DDL has already committed. The per-file locked recheck remains needed
# for competing runners and changes after this read-only preflight.
if ! node scripts/sql-ledger-preflight.mjs | psql_admin -q; then
  echo 'BLOCKED: full SQL ledger preflight failed; no migration DDL applied. Independently verify historical attestation.' >&2
  exit 1
fi

for file in packages/db/migrations/*.sql; do
  name=$(basename "$file")
  if [[ ! "$name" =~ ^[0-9]{4}_[a-z0-9_]+\.sql$ ]]; then
    echo "BLOCKED: invalid migration filename $name" >&2
    exit 1
  fi
  digest=$(node -e 'const {createHash}=require("node:crypto");const {readFileSync}=require("node:fs");process.stdout.write(createHash("sha256").update(readFileSync(process.argv[1])).digest("hex"))' "$file")
  installed=$(psql_admin -At -c "SELECT 1 FROM public.schema_migrations WHERE filename = '$name'")
  if [[ "$installed" == '1' ]]; then
    recorded=$(psql_admin -At -c "SELECT COALESCE(source_sha256, 'UNATTESTED') FROM public.schema_migrations WHERE filename = '$name'")
    if [[ "$recorded" != "$digest" ]]; then
      echo "BLOCKED: $name has no trustworthy SQL-byte attestation or its recorded digest differs. Independently verify historical deployment evidence; never auto-backfill." >&2
      exit 1
    fi
    echo "SKIP: $name already applied (SHA-256 verified)"
    continue
  fi
  [[ -z "$installed" ]] || { echo "BLOCKED: unexpected ledger state for $name" >&2; exit 1; }
  echo "APPLY: $name"
  # The outer ledger lookup is only an optimization. Two CI/deploy processes
  # can both see a migration as absent. Lock the ledger inside ONE transaction,
  # then recheck the row AFTER acquiring the lock. A losing process skips DDL.
  # psql \gset stores the SELECT's boolean as :needs_apply and \if evaluates
  # it without closing the transaction (including the conditional INSERT).
  if ! {
    printf 'BEGIN;\nLOCK TABLE public.schema_migrations IN EXCLUSIVE MODE;\n'
    # Recheck the byte attestation under the same lock as the DDL. A competing
    # deployment must never cause a mismatched migration to be silently skipped.
    cat <<SQL
DO \$ledger\$ BEGIN
  IF EXISTS (SELECT 1 FROM public.schema_migrations
             WHERE filename = '$name' AND source_sha256 IS DISTINCT FROM '$digest') THEN
    RAISE EXCEPTION 'Existing SQL migration has missing or mismatched source attestation';
  END IF;
END \$ledger\$;
SQL
    printf "SELECT NOT EXISTS (SELECT 1 FROM public.schema_migrations WHERE filename = '%s') AS needs_apply \\gset\n" "$name"
    printf '\\if :needs_apply\n'
    cat "$file"
    printf "\nINSERT INTO public.schema_migrations(filename) VALUES ('%s');\n" "$name"
    printf "UPDATE public.schema_migrations SET source_sha256 = '%s' WHERE filename = '%s' AND source_sha256 IS NULL;\n" "$digest" "$name"
    printf '\\else\n\\echo SKIP: migration already applied by a concurrent runner\n\\endif\nCOMMIT;\n'
  } | psql_admin -q; then
    echo "BLOCKED: $name failed; migration and ledger insertion rolled back." >&2
    exit 1
  fi
done

expected=$(for file in packages/db/migrations/*.sql; do basename "$file"; done | LC_ALL=C sort)
applied=$(psql_admin -At -c 'SELECT filename FROM public.schema_migrations ORDER BY filename')
if [[ "$expected" != "$applied" ]]; then
  echo 'BLOCKED: database SQL migration ledger does not match release contents.' >&2
  exit 1
fi
printf 'PASS: %s SQL migrations match the deployment ledger. Apply RLS immediately.\n' "$(printf '%s\n' "$expected" | wc -l | tr -d ' ')"

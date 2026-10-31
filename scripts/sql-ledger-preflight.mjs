/** Fail closed on *all* existing SQL ledger rows before applying any new DDL.
 * A filename-only historical row is not proof of the SQL bytes once deployed.
 * This is a preflight, not a replacement for the per-migration locked recheck.
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyRepositoryMigrations } from './verify-migration-chain.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = /^[0-9]{4}_[a-z0-9_]+\.sql$/;
const DIGEST = /^[a-f0-9]{64}$/;

export function buildSqlLedgerPreflight(manifest) {
  if (!manifest || manifest.schemaVersion !== 1 || manifest.algorithm !== 'sha256' ||
      !manifest.files || typeof manifest.files !== 'object' || Array.isArray(manifest.files)) {
    throw new Error('Invalid SQL migration checksum manifest');
  }
  const entries = Object.entries(manifest.files).sort(([a], [b]) => a.localeCompare(b));
  if (!entries.length || entries.some(([name, digest]) => !NAME.test(name) || !DIGEST.test(digest))) {
    throw new Error('Invalid or empty SQL migration checksum inventory');
  }
  // Identifiers and values are taken exclusively from the validated, pinned
  // release manifest. Never interpolate database rows or command-line inputs.
  const values = entries.map(([name, digest]) => `('${name}', '${digest}')`).join(',\n    ');
  return `BEGIN;
LOCK TABLE public.schema_migrations IN SHARE MODE;
DO $epmo_ledger_preflight$
DECLARE bad_filename text;
BEGIN
  SELECT ledger.filename INTO bad_filename
  FROM public.schema_migrations AS ledger
  LEFT JOIN (VALUES
    ${values}
  ) AS expected(filename, digest) ON ledger.filename = expected.filename
  WHERE expected.filename IS NULL OR ledger.source_sha256 IS DISTINCT FROM expected.digest
  ORDER BY ledger.filename LIMIT 1;
  IF bad_filename IS NOT NULL THEN
    RAISE EXCEPTION 'BLOCKED: unknown, unattested or mismatched SQL ledger row: %', bad_filename;
  END IF;

  -- Every applied migration must be an uninterrupted prefix of the pinned
  -- release. Otherwise a missing older migration would be executed *after*
  -- a newer one, possibly applying destructive or out-of-order DDL.
  SELECT expected.filename INTO bad_filename
  FROM (
    SELECT filename, row_number() OVER (ORDER BY filename) AS ordinal
    FROM (VALUES
      ${values}
    ) AS pinned(filename, digest)
  ) AS expected
  LEFT JOIN public.schema_migrations AS applied ON applied.filename = expected.filename
  WHERE expected.ordinal <= (SELECT count(*) FROM public.schema_migrations)
    AND applied.filename IS NULL
  ORDER BY expected.ordinal LIMIT 1;
  IF bad_filename IS NOT NULL THEN
    RAISE EXCEPTION 'BLOCKED: SQL migration ledger has an out-of-order gap at: %', bad_filename;
  END IF;
END $epmo_ledger_preflight$;
COMMIT;`;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    verifyRepositoryMigrations();
    const manifest = JSON.parse(readFileSync(resolve(root, 'packages/db/migrations/meta/_sha256.json'), 'utf8'));
    process.stdout.write(buildSqlLedgerPreflight(manifest) + '\n');
  } catch (error) {
    console.error(`BLOCKED: SQL ledger preflight generation failed: ${error.message}`);
    process.exitCode = 1;
  }
}

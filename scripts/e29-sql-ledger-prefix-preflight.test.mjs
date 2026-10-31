/** E29 P0: reject out-of-order historical SQL migration ledgers before DDL. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSqlLedgerPreflight } from './sql-ledger-preflight.mjs';

const manifest = {
  schemaVersion: 1,
  algorithm: 'sha256',
  files: {
    '0002_third.sql': 'c'.repeat(64),
    '0000_first.sql': 'a'.repeat(64),
    '0001_second.sql': 'b'.repeat(64),
  },
};

test('preflight locks ledger and checks every attested row before checking the prefix', () => {
  const sql = buildSqlLedgerPreflight(manifest);
  assert.match(sql, /BEGIN;\s*LOCK TABLE public\.schema_migrations IN SHARE MODE/);
  assert.match(sql, /source_sha256 IS DISTINCT FROM expected\.digest/);
  assert.match(sql, /unknown, unattested or mismatched SQL ledger row/);
  assert.match(sql, /out-of-order gap at/);
  assert.ok(sql.indexOf('unknown, unattested') < sql.indexOf('out-of-order gap'));
  assert.match(sql, /COMMIT;\s*$/);
});

test('historical ledger must be a contiguous prefix, not an arbitrary attested subset', () => {
  const sql = buildSqlLedgerPreflight(manifest);
  // A database with 0001 applied but 0000 absent must fail before the runner
  // applies 0000 after 0001. Counting applied rows and checking every ordinal
  // <= that count catches this even when all existing checksums are valid.
  assert.match(sql, /row_number\(\) OVER \(ORDER BY filename\) AS ordinal/);
  assert.match(sql, /LEFT JOIN public\.schema_migrations AS applied ON applied\.filename = expected\.filename/);
  assert.match(sql, /expected\.ordinal <= \(SELECT count\(\*\) FROM public\.schema_migrations\)/);
  assert.match(sql, /AND applied\.filename IS NULL/);
  assert.match(sql, /ORDER BY expected\.ordinal LIMIT 1/);
  const matches = [...sql.matchAll(/\('000[012]_(?:first|second|third)\.sql', '[a-f0-9]{64}'\)/g)];
  assert.equal(matches.length, 6, 'both checks must use the pinned manifest');
  assert.deepEqual(matches.slice(0, 3).map(m => m[0].slice(2, 6)), ['0000', '0001', '0002']);
  assert.deepEqual(matches.slice(3).map(m => m[0].slice(2, 6)), ['0000', '0001', '0002']);
});

test('malformed pinned manifest fails closed rather than generating SQL', () => {
  assert.throws(() => buildSqlLedgerPreflight({ ...manifest, algorithm: 'md5' }), /Invalid SQL/);
  assert.throws(() => buildSqlLedgerPreflight({ ...manifest, files: {} }), /Invalid or empty/);
  assert.throws(() => buildSqlLedgerPreflight({ ...manifest, files: { '0000_first.sql': 'bad' } }), /Invalid or empty/);
});

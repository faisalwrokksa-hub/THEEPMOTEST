import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, chmodSync, rmSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { buildSqlLedgerPreflight } from './sql-ledger-preflight.mjs';

const digest = 'a'.repeat(64);
const valid = { schemaVersion: 1, algorithm: 'sha256', files: { '0000_initial.sql': digest } };

test('preflight locks entire ledger and rejects unknown, unattested and mismatched rows', () => {
  const sql = buildSqlLedgerPreflight(valid);
  assert.match(sql, /BEGIN;\nLOCK TABLE public\.schema_migrations IN SHARE MODE;/);
  assert.match(sql, /LEFT JOIN \(VALUES[\s\S]*0000_initial\.sql/);
  assert.match(sql, /expected\.filename IS NULL OR ledger\.source_sha256 IS DISTINCT FROM expected\.digest/);
  assert.match(sql, /RAISE EXCEPTION 'BLOCKED: unknown, unattested or mismatched SQL ledger row/);
  assert.match(sql, /COMMIT;$/);
});

test('invalid manifest names and checksums cannot be interpolated into SQL', () => {
  assert.throws(() => buildSqlLedgerPreflight({ ...valid, files: { "x'); DROP TABLE users;--": digest } }), /Invalid or empty/);
  assert.throws(() => buildSqlLedgerPreflight({ ...valid, files: { '0000_initial.sql': 'bad' } }), /Invalid or empty/);
  assert.throws(() => buildSqlLedgerPreflight({ ...valid, files: {} }), /Invalid or empty/);
});

test('runner aborts before applying migration DDL when full-ledger preflight fails', () => {
  const dir = mkdtempSync(join(tmpdir(), 'epmo-e24-'));
  try {
    const scripts = join(dir, 'scripts');
    const migrations = join(dir, 'packages/db/migrations');
    mkdirSync(scripts, { recursive: true });
    mkdirSync(join(migrations, 'meta'), { recursive: true });
    const project = resolve(import.meta.dirname, '..');
    copyFileSync(join(project, 'scripts/apply-sql-migrations.sh'), join(scripts, 'apply-sql-migrations.sh'));
    copyFileSync(join(project, 'scripts/sql-ledger-preflight.mjs'), join(scripts, 'sql-ledger-preflight.mjs'));
    writeFileSync(join(scripts, 'verify-migration-chain.mjs'), 'export const verifyRepositoryMigrations = () => ({count:1});\n');
    writeFileSync(join(migrations, 'meta/_sha256.json'), JSON.stringify(valid));
    writeFileSync(join(migrations, '0000_initial.sql'), 'CREATE TABLE should_not_run(id integer);\n');
    const bin = join(dir, 'psql');
    const trace = join(dir, 'trace');
    writeFileSync(bin, [
      '#!/usr/bin/env node',
      "const fs = require('node:fs');",
      'const args = process.argv.slice(2);',
      "if (args.includes('-c')) { console.log('0'); process.exit(0); }",
      "let body = '';",
      "process.stdin.on('data', chunk => body += chunk);",
      "process.stdin.on('end', () => {",
      "  fs.appendFileSync(process.env.EPMO_TEST_TRACE, body + '\\n--END--\\n');",
      "  if (body.includes('DO $epmo_ledger_preflight$')) process.exit(13);",
      '});',
    ].join('\n') + '\n');
    chmodSync(bin, 0o755);
    const result = spawnSync('bash', [join(scripts, 'apply-sql-migrations.sh')], {
      cwd: dir, encoding: 'utf8', timeout: 15000,
      env: { ...process.env, PATH: dir + ':' + process.env.PATH, PGHOST: 'localhost',
        PGUSER: 'postgres', PGDATABASE: 'pmo', PGPASSWORD: 'fake', EPMO_TEST_TRACE: trace },
    });
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /full SQL ledger preflight failed/);
    const sql = readFileSync(trace, 'utf8');
    assert.match(sql, /DO \$epmo_ledger_preflight\$/);
    assert.doesNotMatch(sql, /CREATE TABLE should_not_run/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

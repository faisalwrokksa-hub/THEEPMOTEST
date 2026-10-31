/** P0: SQL bytes applied to PostgreSQL must be the bytes pinned by the manifest. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { verifyMigrationSnapshot } from './verified-migration-snapshot.mjs';

const bytes = Buffer.from('CREATE TABLE safe_example (id integer);\n');
const digest = createHash('sha256').update(bytes).digest('hex');
const manifest = { schemaVersion: 1, algorithm: 'sha256',
  files: { '0000_initial_schema.sql': digest } };

test('frozen SQL snapshot matches the pinned release checksum', () => {
  assert.equal(verifyMigrationSnapshot('0000_initial_schema.sql', bytes, manifest), digest);
  assert.throws(() => verifyMigrationSnapshot('0000_initial_schema.sql',
    Buffer.from('DROP TABLE safe_example;\n'), manifest), /snapshot bytes differ/);
  assert.throws(() => verifyMigrationSnapshot('0001_other.sql', bytes, manifest), /Missing pinned/);
});

test('malformed migration names and manifests cannot bypass byte attestation', () => {
  assert.throws(() => verifyMigrationSnapshot('../evil.sql', bytes, manifest), /Invalid SQL/);
  assert.throws(() => verifyMigrationSnapshot('0000_initial_schema.sql', bytes,
    { ...manifest, algorithm: 'md5' }), /Invalid SQL/);
  assert.throws(() => verifyMigrationSnapshot('0000_initial_schema.sql', bytes,
    { ...manifest, files: { '0000_initial_schema.sql': 'invalid' } }), /Missing pinned/);
});

test('SQL runner verifies and executes the same private frozen snapshot', () => {
  const runner = readFileSync(new URL('./apply-sql-migrations.sh', import.meta.url), 'utf8');
  assert.match(runner, /snapshot_dir=\$\(mktemp -d/);
  assert.match(runner, /cp -- "\$file" "\$snapshot"/);
  assert.match(runner, /verified-migration-snapshot\.mjs "\$name" "\$snapshot"/);
  assert.match(runner, /cat "\$snapshot"/);
  assert.doesNotMatch(runner, /cat "\$file"/);
});

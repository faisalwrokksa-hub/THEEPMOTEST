import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, cpSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { checkMigrationHashes, verifyRepositoryMigrations } from './verify-migration-chain.mjs';
const root = resolve(import.meta.dirname, '..');
const source = join(root, 'packages/db/migrations');
const digest = text => createHash('sha256').update(text).digest('hex');
const valid = { schemaVersion: 1, algorithm: 'sha256', files: { '0000_initial.sql': digest('CREATE TABLE t(id int);') } };
const hashes = { '0000_initial.sql': digest('CREATE TABLE t(id int);') };

test('existing 20 migration SQL sources match pinned release digests', () => {
  const result = verifyRepositoryMigrations();
  assert.equal(result.count, 20);
  assert.equal(result.checksumsVerified, true);
});
test('matching SQL contents accepted', () => assert.deepEqual(checkMigrationHashes(valid, hashes), []));
test('changed SQL body rejected despite identical migration filename', () => {
  assert.match(checkMigrationHashes(valid, { '0000_initial.sql': digest('DROP TABLE t;') }).join(' '), /Modified migration SQL/);
});
test('new migration requires a pinned digest', () => {
  assert.match(checkMigrationHashes(valid, { ...hashes, '0001_new.sql': digest('SELECT 1;') }).join(' '), /Unpinned/);
});
test('removed migration remains detectable', () => {
  assert.match(checkMigrationHashes(valid, {}).join(' '), /Missing pinned/);
});
test('manifest digest format and schema must be valid', () => {
  assert.match(checkMigrationHashes({ ...valid, schemaVersion: 99 }, hashes).join(' '), /manifest missing or invalid/);
  assert.match(checkMigrationHashes({ ...valid, files: { '0000_initial.sql': 'not-a-hash' } }, hashes).join(' '), /invalid digest/);
});
test('actual verifier fails if a migration is tampered in an extracted release', () => {
  const staging = mkdtempSync(join(tmpdir(), 'epmo-sql-hash-'));
  try {
    const tempMigrations = join(staging, 'migrations');
    cpSync(source, tempMigrations, { recursive: true });
    const file = join(tempMigrations, '0017_tenant_membership_status.sql');
    writeFileSync(file, readFileSync(file, 'utf8') + '\n-- unintentionally altered SQL\n');
    assert.throws(() => verifyRepositoryMigrations(tempMigrations), /Modified migration SQL/);
  } finally { rmSync(staging, { recursive: true, force: true }); }
});
test('staging bootstrap runs migration integrity gate before altering database', () => {
  const bootstrap = readFileSync(join(root, 'infra/bootstrap-db.sh'), 'utf8');
  assert.ok(bootstrap.indexOf('node scripts/verify-migration-chain.mjs') < bootstrap.indexOf('1/3 application role'));
  assert.match(bootstrap, /BLOCKED: migration chain or SQL content differs/);
  const ciRunner = readFileSync(join(root, 'scripts/apply-sql-migrations.sh'), 'utf8');
  assert.match(ciRunner, /node scripts\/verify-migration-chain.mjs/);
});

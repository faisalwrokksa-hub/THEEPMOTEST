import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, writeFileSync, chmodSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseRemote, validateDrillEnvironment, encryptArchive, decryptArchive } from './staging-synthetic-recovery.mjs';

const key = randomBytes(32);
test('S34 AES-256-GCM encrypted backup round trip is authenticated and not plaintext', () => {
  const original = Buffer.from('synthetic PGDMP recovery payload');
  const sealed = encryptArchive(original, key);
  assert.equal(sealed.includes(original), false);
  assert.deepEqual(decryptArchive(sealed, key), original);
  assert.notDeepEqual(encryptArchive(original, key), sealed);
});
test('S34 tampering, wrong key, truncated header and wrong format fail closed', () => {
  const sealed = encryptArchive(Buffer.from('PGDMP synthetic only'), key);
  const tampered = Buffer.from(sealed); tampered[tampered.length - 1] ^= 1;
  assert.throws(() => decryptArchive(tampered, key));
  assert.throws(() => decryptArchive(sealed, randomBytes(32)));
  assert.throws(() => decryptArchive(sealed.subarray(0, 8), key));
  assert.throws(() => decryptArchive(Buffer.from('plaintext PGDMP'), key));
});
test('S34 off-host destination rejects local, generic, production and traversal paths', () => {
  for (const url of ['/tmp/backup', 'file:///tmp/backup', 'https://example.org/a',
    's3://bucket/production/', 's3://bucket/epmo-synthetic-drills/../production',
    's3://bucket/epmo-synthetic-drills//oops']) assert.throws(() => parseRemote(url), url);
  assert.deepEqual(parseRemote('s3://epmo-test-bucket/epmo-synthetic-drills/staging'),
    { bucket: 'epmo-test-bucket', prefix: 'epmo-synthetic-drills/staging' });
});
test('S34 environment refuses production secrets, missing approvals and non-pinned images', () => {
  const dir = mkdtempSync(join(tmpdir(), 'epmo-s34-test-'));
  try {
    const path = join(dir, 'key'); writeFileSync(path, key); chmodSync(path, 0o600);
    const valid = { DEPLOYMENT_ENV: 'staging', EPMO_SYNTHETIC_ONLY: 'YES',
      EPMO_REMOTE_IO_APPROVED: 'YES', EPMO_RECOVERY_S3_PREFIX: 's3://epmo-test-bucket/epmo-synthetic-drills/staging',
      EPMO_RECOVERY_KEY_FILE: path, EPMO_PG_IMAGE: 'postgres:16-alpine@sha256:' + 'a'.repeat(64) };
    assert.deepEqual(validateDrillEnvironment(valid).key, key);
    for (const delta of [{ DATABASE_URL: 'postgres://production' }, { PGHOST: 'production' },
      { STRIPE_SECRET_KEY: 'sk_live_fake' }, { EPMO_REMOTE_IO_APPROVED: 'NO' },
      { DEPLOYMENT_ENV: 'production' }, { EPMO_PG_IMAGE: 'postgres:16-alpine' },
      { AWS_ENDPOINT_URL: 'http://localhost:9000' }]) {
      assert.throws(() => validateDrillEnvironment({ ...valid, ...delta }));
    }
    chmodSync(path, 0o644);
    assert.throws(() => validateDrillEnvironment(valid));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

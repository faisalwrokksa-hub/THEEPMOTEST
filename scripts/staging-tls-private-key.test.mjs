import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { tlsMaterialChecks } from '../infra/staging/preflight.mjs';

const root = resolve(import.meta.dirname, '..');
const openssl = (...args) => {
  const run = spawnSync('openssl', args, { encoding: 'utf8', timeout: 15000 });
  assert.equal(run.status, 0, 'OpenSSL fixture generation must succeed');
};

test('S11 staging TLS preflight accepts private key, rejects public-key substitution and wrong key', () => {
  const dir = mkdtempSync(join(tmpdir(), 'epmo-s11-tls-'));
  const cert = join(dir, 'tls.crt');
  const key = join(dir, 'tls.key');
  const publicOnly = join(dir, 'public.pem');
  const otherKey = join(dir, 'other.key');
  try {
    openssl('req', '-x509', '-newkey', 'rsa:2048', '-nodes',
      '-keyout', key, '-out', cert, '-days', '3',
      '-subj', '/CN=staging.theepmo.com',
      '-addext', 'subjectAltName=DNS:staging.theepmo.com,DNS:api-staging.theepmo.com');
    chmodSync(key, 0o600);
    const env = { STAGING_TLS_CERT_PATH: cert, STAGING_TLS_KEY_PATH: key };
    const valid = tlsMaterialChecks(env, root);
    assert.ok(valid.every(check => check.passed), JSON.stringify(valid));

    // Previously this public-only PEM passed because createPublicKey() accepts
    // public PEMs. Nginx cannot use it as ssl_certificate_key.
    openssl('pkey', '-in', key, '-pubout', '-out', publicOnly);
    chmodSync(publicOnly, 0o600);
    const publicChecks = tlsMaterialChecks({ ...env, STAGING_TLS_KEY_PATH: publicOnly }, root);
    assert.ok(publicChecks.some(check => !check.passed),
      'Public key alone must never count as a TLS private key');

    openssl('genpkey', '-algorithm', 'RSA', '-pkeyopt', 'rsa_keygen_bits:2048',
      '-out', otherKey);
    chmodSync(otherKey, 0o600);
    const wrong = tlsMaterialChecks({ ...env, STAGING_TLS_KEY_PATH: otherKey }, root);
    assert.equal(wrong.find(check => check.name === 'TLS private key matches the certificate')?.passed, false);

    chmodSync(key, 0o644);
    const readable = tlsMaterialChecks(env, root);
    assert.equal(readable.find(check => check.name.includes('private key permissions'))?.passed, false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

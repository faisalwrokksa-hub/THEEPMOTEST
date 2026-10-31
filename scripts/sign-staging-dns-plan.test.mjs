import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync, statSync, rmSync, chmodSync, symlinkSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createStagingDnsApproval } from './sign-staging-dns-plan.mjs';
import { validateSignedDnsApproval } from './staging-dns-approval.mjs';

const plan = () => ({ environment: 'staging', zone: 'theepmo.com', records: [
  { name: 'staging.theepmo.com', type: 'A', value: '8.8.8.8', ttl: 300 },
  { name: 'api-staging.theepmo.com', type: 'A', value: '8.8.4.4', ttl: 300 },
] });
const { privateKey, publicKey } = generateKeyPairSync('ed25519');
const priv = privateKey.export({ type: 'pkcs8', format: 'pem' });
const pub = publicKey.export({ type: 'spki', format: 'pem' });
const fingerprint = createHash('sha256').update(publicKey.export({ type: 'spki', format: 'der' })).digest('hex');
test('S20 offline signer creates an approval accepted by verifier', () => {
  const p = plan(), now = Date.parse('2026-10-31T08:00:00.000Z');
  const a = createStagingDnsApproval(p, priv, 'STAGING-1234', 'release-reviewer', now);
  assert.deepEqual(validateSignedDnsApproval({ plan: p, approval: a, trustedPublicKeyPem: pub, trustedKeySha256: fingerprint, now }), []);
});
test('S20 signer rejects public key, production domain and invalid change metadata', () => {
  assert.throws(() => createStagingDnsApproval(plan(), pub, 'STAGING-1234', 'reviewer'));
  const p = plan(); p.records[0].name = 'theepmo.com';
  assert.throws(() => createStagingDnsApproval(p, priv, 'STAGING-1234', 'reviewer'));
  assert.throws(() => createStagingDnsApproval(plan(), priv, '!', 'reviewer'));
});
test('S20 signer CLI writes restricted approval and refuses overwrite', () => {
  const dir = mkdtempSync(join(tmpdir(), 'epmo-s20-'));
  try {
    const input = join(dir, 'plan.json'), key = join(dir, 'signer.pem'), output = join(dir, 'signed.json');
    writeFileSync(input, JSON.stringify(plan()));
    writeFileSync(key, priv, { mode: 0o600 });
    const args = ['--plan', input, '--private-key', key, '--change-id', 'STAGING-1234',
      '--approved-by', 'reviewer', '--output', output];
    const cmd = fileURLToPath(new URL('./sign-staging-dns-plan.mjs', import.meta.url));
    const first = spawnSync(process.execPath, [cmd, ...args], { encoding: 'utf8' });
    assert.equal(first.status, 0, first.stderr);
    assert.ok(JSON.parse(readFileSync(output, 'utf8')).signature);
    if (process.platform !== 'win32') assert.equal(statSync(output).mode & 0o777, 0o600);
    const second = spawnSync(process.execPath, [cmd, ...args], { encoding: 'utf8' });
    assert.notEqual(second.status, 0);
    if (process.platform !== 'win32') {
      chmodSync(key, 0o644);
      const unsafeOutput = join(dir, 'unsafe.json');
      const unsafeArgs = [...args.slice(0, -1), unsafeOutput];
      const unsafe = spawnSync(process.execPath, [cmd, ...unsafeArgs], { encoding: 'utf8' });
      assert.notEqual(unsafe.status, 0);
      assert.equal(existsSync(unsafeOutput), false);
      chmodSync(key, 0o600);
      const symlink = join(dir, 'linked.pem');
      symlinkSync(key, symlink);
      const linkArgs = [...args];
      linkArgs[3] = symlink;
      linkArgs[linkArgs.length - 1] = unsafeOutput;
      const linked = spawnSync(process.execPath, [cmd, ...linkArgs], { encoding: 'utf8' });
      assert.notEqual(linked.status, 0);
      assert.equal(existsSync(unsafeOutput), false);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
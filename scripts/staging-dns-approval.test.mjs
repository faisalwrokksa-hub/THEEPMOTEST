import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { canonicalDnsJson, validateSignedDnsApproval } from './staging-dns-approval.mjs';

const digest = x => createHash('sha256').update(x).digest('hex');
const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const pem = publicKey.export({ type: 'spki', format: 'pem' });
const fingerprint = digest(publicKey.export({ type: 'spki', format: 'der' }));
const now = Date.parse('2026-10-31T08:00:00.000Z');
const plan = () => ({ environment: 'staging', zone: 'theepmo.com', records: [
  { name: 'staging.theepmo.com', type: 'A', value: '8.8.8.8', ttl: 300 },
  { name: 'api-staging.theepmo.com', type: 'A', value: '8.8.4.4', ttl: 300 },
] });
function approvalFor(p) {
  const payload = { environment: 'staging', zone: 'theepmo.com', planSha256: digest(canonicalDnsJson(p)),
    changeId: 'STAGING-1234', approvedBy: 'release-reviewer',
    issuedAt: '2026-10-31T07:00:00.000Z', expiresAt: '2026-10-31T09:00:00.000Z' };
  return { payload, signature: sign(null, Buffer.from(canonicalDnsJson(payload)), privateKey).toString('base64') };
}
const check = (p, a, opts = {}) => validateSignedDnsApproval({
  plan: p, approval: a, trustedPublicKeyPem: pem, trustedKeySha256: fingerprint, now, ...opts,
});
test('S20 accepts only exact signed time-bound staging plan with pinned key', () => {
  const p = plan(); assert.deepEqual(check(p, approvalFor(p)), []);
});
test('S20 rejects tampered DNS plan and signed approval timestamps', () => {
  const p = plan(), a = approvalFor(p); p.records[0].value = '1.1.1.1'; assert.ok(check(p, a).length);
  const q = plan(), b = approvalFor(q); b.payload.expiresAt = '2026-10-31T10:00:00.000Z'; assert.ok(check(q, b).length);
});
test('S20 rejects expired, future and overlong approvals', () => {
  const p = plan(), a = approvalFor(p);
  assert.ok(check(p, a, { now: Date.parse('2026-10-31T09:00:00.000Z') }).length);
  assert.ok(check(p, a, { now: Date.parse('2026-10-31T06:00:00.000Z') }).length);
  const b = approvalFor(p); b.payload.expiresAt = '2026-11-02T09:00:00.000Z';
  assert.ok(check(p, b).length);
});
test('S20 rejects wrong, absent or substituted trusted public key', () => {
  const p = plan(), a = approvalFor(p);
  assert.ok(check(p, a, { trustedKeySha256: '0'.repeat(64) }).length);
  assert.ok(check(p, a, { trustedKeySha256: undefined }).length);
  assert.ok(check(p, a, { trustedPublicKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }) }).length);
  const rogue = generateKeyPairSync('ed25519');
  assert.ok(check(p, a, { trustedPublicKeyPem: rogue.publicKey.export({ type: 'spki', format: 'pem' }) }).length);
});
test('S20 rejects malformed signatures, extra envelope fields and production hostnames', () => {
  const p = plan(), a = approvalFor(p); a.signature = 'not-base64!'; assert.ok(check(p, a).length);
  const q = plan(); q.records[0].name = 'theepmo.com'; assert.ok(check(q, approvalFor(q)).length);
  const r = plan(), b = approvalFor(r); b.extra = true; assert.ok(check(r, b).length);
});
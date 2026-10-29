import test from 'node:test';
import assert from 'node:assert/strict';
import { issueRecoveryToken, hashRecoveryToken, recoveryLink, recoveryMessage } from './recovery-policy.ts';

test('recovery tokens have 256 bits of randomness and independent hashes', () => {
  const a = issueRecoveryToken(), b = issueRecoveryToken();
  assert.match(a.token, /^[A-Za-z0-9_-]{43}$/);
  assert.match(a.hash, /^[0-9a-f]{64}$/);
  assert.notEqual(a.token, b.token);
  assert.notEqual(a.hash, b.hash);
  assert.equal(a.hash, hashRecoveryToken(a.token));
  assert.notEqual(a.hash, a.token);
});
test('invalid raw token is rejected without DB work', () => {
  for (const t of ['short', 'x'.repeat(200), '/'.repeat(43), '', 'x'.repeat(42)])
    assert.throws(() => hashRecoveryToken(t));
});
test('recovery link hides bearer token in URL fragment', () => {
  const t = issueRecoveryToken().token;
  const link = new URL(recoveryLink('https://app.epmo.example', t));
  assert.equal(link.pathname, '/reset-password');
  assert.equal(link.search, '');
  assert.equal(link.hash, '#token='+t);
  assert.doesNotMatch(link.origin + link.pathname + link.search, new RegExp(t));
});
test('refuses untrusted URLs or external redirect sources', () => {
  const t = issueRecoveryToken().token;
  for (const u of ['http://example.com','javascript:alert(1)','https://evil.example@trusted.example',
    'https://example.com/signin', 'https://example.com?q=foo', 'https://example.com/#bad']) {
    assert.throws(() => recoveryLink(u, t), u);
  }
});
test('allows plain HTTP only for local development', () => {
  const t = issueRecoveryToken().token;
  assert.match(recoveryLink('http://localhost:3000', t), /^http:\/\/localhost:3000\/reset-password#token=/);
});
test('both recovery email languages include the same link and expiry', () => {
  const t = issueRecoveryToken().token;
  const link = recoveryLink('https://app.epmo.example',t);
  for (const lang of ['en','ar']) {
    const m = recoveryMessage(link,lang);
    assert.ok(m.body.includes(link));
    assert.ok(m.subject.length > 10);
    assert.ok(m.body.includes('30'));
  }
});

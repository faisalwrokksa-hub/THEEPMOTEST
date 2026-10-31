import test from 'node:test';
import assert from 'node:assert/strict';
import { postRecoveryToApi } from './recovery-proxy.mjs';

const endpoint = 'https://api.theepmo.com/auth/password-recovery/reset';
const token = 's'.repeat(43);
const password = 'long-secret-password-123';

test('reset bearer and new password are sent only in a nonredirecting POST', async () => {
  let calls = 0;
  const fetcher = async (url, options) => {
    calls++;
    assert.equal(url, endpoint);
    assert.equal(options.method, 'POST');
    assert.equal(options.redirect, 'error');
    assert.equal(options.cache, 'no-store');
    assert.equal(options.headers['content-type'], 'application/json');
    assert.deepEqual(JSON.parse(options.body), { token, password });
    return { ok: true, status: 204 };
  };
  assert.equal(await postRecoveryToApi(fetcher, endpoint, { token, password }), 200);
  assert.equal(calls, 1);
});

test('upstream redirect cannot be surfaced or followed', async () => {
  let calls = 0;
  const fetcher = async (_url, options) => {
    calls++;
    assert.equal(options.redirect, 'error');
    return { ok: false, status: 307, headers: { location: 'https://evil.example/collect' } };
  };
  assert.equal(await postRecoveryToApi(fetcher, endpoint, { token, password }), 502);
  assert.equal(calls, 1);
  const blocked = async (_url, options) => {
    assert.equal(options.redirect, 'error');
    throw new TypeError('redirect blocked');
  };
  assert.equal(await postRecoveryToApi(blocked, endpoint, { token, password }), 503);
});

test('only safe HTTP status is returned; upstream body and secrets are never reflected', async () => {
  const fetcher = async () => ({
    ok: false, status: 400,
    text: async () => `secret=${token}; password=${password}; internal stack`,
  });
  assert.equal(await postRecoveryToApi(fetcher, endpoint, { token, password }), 400);
  const malformed = async () => ({ ok: false, status: 0 });
  assert.equal(await postRecoveryToApi(malformed, endpoint, { token, password }), 502);
});

test('recovery request email is also protected against redirect replay', async () => {
  const fetcher = async (_url, options) => {
    assert.equal(options.redirect, 'error');
    assert.deepEqual(JSON.parse(options.body), { email: 'user@example.com', lang: 'ar' });
    return { ok: true, status: 200 };
  };
  assert.equal(await postRecoveryToApi(fetcher,
    'https://api.theepmo.com/auth/password-recovery/request',
    { email: 'user@example.com', lang: 'ar' }), 200);
});

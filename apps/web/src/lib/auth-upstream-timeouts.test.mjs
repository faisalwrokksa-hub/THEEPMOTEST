import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { postLoginToApi } from './login-proxy.mjs';
import { postRecoveryToApi } from './recovery-proxy.mjs';

const endpoint = 'https://api.theepmo.com/auth/login';
const credentials = { identifier: 'user@example.com', password: 'not-a-real-password' };

test('F38: sign-in sends one nonredirecting credential POST with an abort deadline', async () => {
  let calls = 0;
  const response = { ok: false, status: 401 };
  const result = await postLoginToApi(async (url, options) => {
    calls++;
    assert.equal(url, endpoint);
    assert.equal(options.method, 'POST');
    assert.equal(options.redirect, 'error');
    assert.equal(options.cache, 'no-store');
    assert.deepEqual(JSON.parse(options.body), credentials);
    assert.ok(options.signal instanceof AbortSignal);
    assert.equal(options.signal.aborted, false);
    return response;
  }, endpoint, credentials);
  assert.equal(result, response);
  assert.equal(calls, 1);
});

test('F38: recovery sends one nonredirecting secret POST with an abort deadline', async () => {
  let calls = 0;
  const payload = { token: 'x'.repeat(43), password: 'new-not-real-password' };
  const result = await postRecoveryToApi(async (url, options) => {
    calls++;
    assert.equal(url, 'https://api.theepmo.com/auth/password-recovery/reset');
    assert.equal(options.redirect, 'error');
    assert.equal(options.cache, 'no-store');
    assert.deepEqual(JSON.parse(options.body), payload);
    assert.ok(options.signal instanceof AbortSignal);
    assert.equal(options.signal.aborted, false);
    return { ok: true, status: 200 };
  }, 'https://api.theepmo.com/auth/password-recovery/reset', payload);
  assert.equal(result, 200);
  assert.equal(calls, 1);
});

test('F38: abort or timeout fails closed without replaying credentials', async () => {
  let calls = 0;
  const aborting = async (_url, options) => {
    calls++;
    assert.ok(options.signal instanceof AbortSignal);
    throw new DOMException('request aborted', 'AbortError');
  };
  assert.equal(await postLoginToApi(aborting, endpoint, credentials), null);
  assert.equal(await postRecoveryToApi(aborting,
    'https://api.theepmo.com/auth/password-recovery/reset',
    { token: 'x'.repeat(43), password: 'new-not-real-password' }), 503);
  assert.equal(calls, 2);
});

test('F38: all public credential-bearing upstream calls enforce 15s abort deadlines', () => {
  const paths = [
    './login-proxy.mjs',
    './recovery-proxy.mjs',
    '../app/api/invite/accept/route.ts',
  ];
  for (const path of paths) {
    const source = readFileSync(new URL(path, import.meta.url), 'utf8');
    assert.match(source, /redirect:\s*'error'/);
    assert.match(source, /signal:\s*AbortSignal\.timeout\(15_000\)/);
  }
  const invite = readFileSync(new URL('../app/api/invite/accept/route.ts', import.meta.url), 'utf8');
  assert.match(invite, /\.catch\(\(\) => null\)/);
  assert.match(invite, /status: 503/);
  assert.doesNotMatch(invite, /redirect:\s*'follow'/);
});

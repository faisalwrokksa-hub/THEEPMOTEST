import test from 'node:test';
import assert from 'node:assert/strict';
import { postLoginToApi } from './login-proxy.mjs';

const endpoint = 'https://api.theepmo.com/auth/login';
const credentials = { identifier: 'user@example.com', password: 'secret-password' };

test('login credentials are sent once in a nonredirecting uncached POST', async () => {
  let calls = 0;
  const response = { ok: true, status: 200, headers: { getSetCookie: () => ['pmo_session=opaque; HttpOnly'] } };
  const result = await postLoginToApi(async (url, options) => {
    calls++;
    assert.equal(url, endpoint);
    assert.equal(options.method, 'POST');
    assert.equal(options.redirect, 'error');
    assert.equal(options.cache, 'no-store');
    assert.equal(options.headers['content-type'], 'application/json');
    assert.deepEqual(JSON.parse(options.body), credentials);
    return response;
  }, endpoint, credentials);
  assert.equal(calls, 1);
  assert.equal(result, response);
});

test('redirect rejection never retries or forwards credentials', async () => {
  let calls = 0;
  const result = await postLoginToApi(async (_url, options) => {
    calls++;
    assert.equal(options.redirect, 'error');
    throw new TypeError('redirect blocked');
  }, endpoint, credentials);
  assert.equal(calls, 1);
  assert.equal(result, null);
});

test('mocked redirect or malformed upstream response fails closed', async () => {
  for (const response of [
    { ok: false, status: 307, headers: { location: 'https://attacker.example/collect' } },
    { ok: false, status: 302 }, { ok: true, status: 0 },
    { ok: true, status: 600 }, { ok: 'true', status: 200 }, null,
  ]) {
    assert.equal(await postLoginToApi(async () => response, endpoint, credentials), null);
  }
});

test('legitimate authentication errors preserve rate-limit and unavailable mapping', async () => {
  for (const status of [400, 401, 403, 429, 500, 503]) {
    const response = { ok: false, status };
    assert.equal(await postLoginToApi(async () => response, endpoint, credentials), response);
  }
});

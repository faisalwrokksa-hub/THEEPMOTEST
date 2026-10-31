import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchAuthenticatedApi } from './authenticated-api-fetch.mjs';

const endpoint = 'https://api.theepmo.com/api/v1/projects';
const headers = { cookie: 'pmo_session=opaque-secret' };

test('authenticated reads are uncached and explicitly reject redirects', async () => {
  let calls = 0;
  const response = { ok: true, status: 200 };
  const actual = await fetchAuthenticatedApi(async (url, options) => {
    calls++;
    assert.equal(url, endpoint);
    assert.equal(options.redirect, 'error');
    assert.equal(options.cache, 'no-store');
    assert.deepEqual(options.headers, headers);
    assert.equal(options.method, undefined);
    return response;
  }, endpoint, headers);
  assert.equal(actual, response);
  assert.equal(calls, 1);
});

test('a rejected redirect never causes a retry with the session cookie', async () => {
  let calls = 0;
  await assert.rejects(fetchAuthenticatedApi(async (_url, options) => {
    calls++;
    assert.equal(options.redirect, 'error');
    throw new TypeError('redirect rejected');
  }, endpoint, headers));
  assert.equal(calls, 1);
});

test('unexpected redirects and malformed responses fail closed', async () => {
  for (const response of [
    { ok: false, status: 301, headers: { location: 'https://attacker.example' } },
    { ok: false, status: 308 }, { ok: true, status: 0 },
    { ok: true, status: 600 }, { ok: 'true', status: 200 }, null,
  ]) {
    await assert.rejects(fetchAuthenticatedApi(async () => response, endpoint, headers),
      /Invalid authenticated API response/);
  }
});

test('real API authorization errors remain available to existing callers', async () => {
  for (const status of [401, 403, 429, 500, 503]) {
    const response = { ok: false, status };
    assert.equal(await fetchAuthenticatedApi(async () => response, endpoint, headers), response);
  }
});

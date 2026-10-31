import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fetchTenantMutation } from './tenant-mutation-fetch.mjs';

const endpoint = 'https://api.theepmo.com/api/v1/create/project';
const cookie = 'pmo_session=opaque-secret';

test('tenant mutations force redirect rejection and no-store for POST and PATCH', async () => {
  for (const method of ['POST', 'PATCH']) {
    let calls = 0;
    const body = JSON.stringify({ name: 'New project' });
    const response = { ok: true, status: 201 };
    const actual = await fetchTenantMutation(async (url, options) => {
      calls++;
      assert.equal(url, endpoint);
      assert.equal(options.method, method);
      assert.equal(options.headers.cookie, cookie);
      assert.equal(options.body, body);
      assert.equal(options.redirect, 'error');
      assert.equal(options.cache, 'no-store');
      return response;
    }, endpoint, { method, headers: { cookie }, body, redirect: 'follow', cache: 'force-cache' });
    assert.equal(actual, response);
    assert.equal(calls, 1);
  }
});

test('redirect rejection never retries or replays an authenticated mutation', async () => {
  let calls = 0;
  const actual = await fetchTenantMutation(async (_url, options) => {
    calls++;
    assert.equal(options.redirect, 'error');
    throw new TypeError('redirect rejected');
  }, endpoint, { method: 'POST', headers: { cookie }, body: '{}' });
  assert.equal(actual, null);
  assert.equal(calls, 1);
});

test('synthetic redirect and malformed responses fail closed', async () => {
  for (const response of [
    { ok: false, status: 301 }, { ok: false, status: 302 },
    { ok: false, status: 307 }, { ok: false, status: 308 },
    { ok: true, status: 0 }, { ok: true, status: 600 },
    { ok: 'true', status: 200 }, null,
  ]) {
    assert.equal(await fetchTenantMutation(async () => response, endpoint,
      { method: 'POST', headers: { cookie } }), null);
  }
});

test('genuine API success and failure statuses remain available to route handlers', async () => {
  for (const status of [200, 201, 204, 400, 401, 403, 429, 500, 503]) {
    const response = { ok: status < 300, status };
    assert.equal(await fetchTenantMutation(async () => response, endpoint,
      { method: 'POST', headers: { cookie } }), response);
  }
});

test('all four session-bearing mutation routes use the fail-closed helper', () => {
  for (const route of ['create', 'onboarding', 'session/logout', 'session/logout-all']) {
    const source = readFileSync(new URL(`../app/api/${route}/route.ts`, import.meta.url), 'utf8');
    assert.match(source, /import \{ fetchTenantMutation \} from ['"]@\/lib\/tenant-mutation-fetch\.mjs['"]/);
    assert.match(source, /await fetchTenantMutation\(fetch,/);
    assert.doesNotMatch(source, /await fetch\(\x60\$\{BASE\}/);
  }
});

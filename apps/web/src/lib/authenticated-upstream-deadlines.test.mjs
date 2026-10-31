import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fetchAuthenticatedApi } from './authenticated-api-fetch.mjs';
import { fetchTenantMutation } from './tenant-mutation-fetch.mjs';

const endpoint = 'https://api.theepmo.com/api/v1/projects';
const cookie = { cookie: 'pmo_session=opaque-test-value' };

test('F39: authenticated reads enforce a deadline without redirecting session cookies', async () => {
  let calls = 0;
  const response = { ok: true, status: 200 };
  const actual = await fetchAuthenticatedApi(async (url, options) => {
    calls++;
    assert.equal(url, endpoint);
    assert.deepEqual(options.headers, cookie);
    assert.equal(options.redirect, 'error');
    assert.equal(options.cache, 'no-store');
    assert.ok(options.signal instanceof AbortSignal);
    assert.equal(options.signal.aborted, false);
    return response;
  }, endpoint, cookie);
  assert.equal(actual, response);
  assert.equal(calls, 1);
});

test('F39: aborted authenticated read fails closed without retrying the session cookie', async () => {
  let calls = 0;
  await assert.rejects(fetchAuthenticatedApi(async (_url, options) => {
    calls++;
    assert.ok(options.signal instanceof AbortSignal);
    throw new DOMException('request deadline exceeded', 'TimeoutError');
  }, endpoint, cookie), { name: 'TimeoutError' });
  assert.equal(calls, 1);
});

test('F39: tenant mutations enforce a deadline and preserve caller cancellation', async () => {
  const controller = new AbortController();
  let calls = 0;
  const pending = fetchTenantMutation(async (_url, options) => {
    calls++;
    assert.equal(options.redirect, 'error');
    assert.equal(options.cache, 'no-store');
    assert.ok(options.signal instanceof AbortSignal);
    assert.equal(options.signal.aborted, false);
    return await new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () =>
        reject(new DOMException('cancelled', 'AbortError')), { once: true });
    });
  }, endpoint, { method: 'POST', headers: cookie, body: '{}', signal: controller.signal });
  controller.abort();
  assert.equal(await pending, null);
  assert.equal(calls, 1);
});

test('F39: mutations without caller signals still have a deadline', async () => {
  let calls = 0;
  const response = { ok: true, status: 204 };
  assert.equal(await fetchTenantMutation(async (_url, options) => {
    calls++;
    assert.ok(options.signal instanceof AbortSignal);
    assert.equal(options.signal.aborted, false);
    return response;
  }, endpoint, { method: 'PATCH', headers: cookie, body: '{}' }), response);
  assert.equal(calls, 1);
});

test('F39: mutation timeout is an unknown outcome and must not replay writes', async () => {
  let calls = 0;
  assert.equal(await fetchTenantMutation(async (_url, options) => {
    calls++;
    assert.ok(options.signal instanceof AbortSignal);
    throw new DOMException('timed out', 'TimeoutError');
  }, endpoint, { method: 'POST', headers: cookie, body: '{}' }), null);
  assert.equal(calls, 1);
});

test('F39: deadlines remain present in both session-bearing fetch helpers', () => {
  const read = readFileSync(new URL('./authenticated-api-fetch.mjs', import.meta.url), 'utf8');
  const write = readFileSync(new URL('./tenant-mutation-fetch.mjs', import.meta.url), 'utf8');
  assert.match(read, /signal:\s*AbortSignal\.timeout\(30_000\)/);
  assert.match(write, /AbortSignal\.timeout\(15_000\)/);
  assert.match(write, /AbortSignal\.any\(\[init\.signal, deadline\]\)/);
  assert.match(read, /redirect:\s*'error'/);
  assert.match(write, /redirect:\s*'error'/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateEntraAcceptanceConfig, runEntraTwoUserReadOnly, safeEntraAcceptanceFailure,
} from './e41-entra-two-user-readonly.mjs';

const tenant = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const a = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const b = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const env = {
  DEPLOYMENT_ENV: 'staging', NODE_ENV: 'test',
  EPMO_ENTRA_READONLY_ACCEPTANCE: 'YES_READ_ONLY_STAGING_ENTRA_TWO_USER',
  EPMO_ENTRA_STAGING_ORIGIN: 'https://staging.theepmo.com',
  EPMO_ENTRA_EXPECTED_TENANT_ID: tenant,
  EPMO_ENTRA_EXPECTED_USER_A_ID: a,
  EPMO_ENTRA_EXPECTED_USER_B_ID: b,
  EPMO_ENTRA_USER_A_SESSION: 'A'.repeat(48),
  EPMO_ENTRA_USER_B_SESSION: 'B'.repeat(48),
};
const cfg = () => validateEntraAcceptanceConfig(env);
const reply = (status, data) => new Response(JSON.stringify(data), {
  status, headers: { 'content-type': 'application/json' },
});
const principal = userId => ({
  authenticated: true, userId, tenantId: tenant, capabilities: ['pmoa_admin'],
});
function fakeFetch(overrides = {}) {
  const calls = [];
  const fetcher = async (url, init) => {
    const path = new URL(url).pathname;
    const cookie = init.headers.cookie || '';
    const owner = cookie === 'pmo_session=' + env.EPMO_ENTRA_USER_A_SESSION;
    const other = cookie === 'pmo_session=' + env.EPMO_ENTRA_USER_B_SESSION;
    calls.push({ path, owner, other, method: init.method, redirect: init.redirect });
    const key = path + ':' + (owner ? 'A' : other ? 'B' : 'anonymous');
    if (overrides[key]) return overrides[key];
    if (path === '/auth/session')
      return reply(200, principal(owner ? a : other ? b : 'unknown'));
    if (path === '/api/v1/microsoft/status') {
      if (!owner && !other) return reply(401, { message: 'Unauthorized' });
      return reply(200, { configured: true, connection: {
        status: 'connected', accountEmail: owner ? 'consenter@example.test' : null,
        scopes: owner ? 'Files.ReadWrite.All' : null, lastError: null,
      } });
    }
    if (path === '/api/v1/microsoft/places')
      return owner ? reply(200, { sites: [], oneDrive: null })
        : reply(403, { message: 'Forbidden' });
    return reply(404, {});
  };
  return { fetcher, calls };
}

test('requires explicit staging opt-in, HTTPS nonproduction host and distinct identities', () => {
  assert.equal(cfg().origin, 'https://staging.theepmo.com');
  for (const change of [
    { EPMO_ENTRA_READONLY_ACCEPTANCE: '' },
    { DEPLOYMENT_ENV: 'production' }, { NODE_ENV: 'production' },
    { EPMO_ENTRA_STAGING_ORIGIN: 'https://theepmo.com' },
    { EPMO_ENTRA_STAGING_ORIGIN: 'https://127.0.0.1' },
    { EPMO_ENTRA_STAGING_ORIGIN: 'http://staging.theepmo.com' },
    { EPMO_ENTRA_STAGING_ORIGIN: 'https://staging.theepmo.com:8443' },
    { EPMO_ENTRA_STAGING_ORIGIN: 'https://staging.theepmo.com/path' },
    { EPMO_ENTRA_EXPECTED_USER_B_ID: a },
    { EPMO_ENTRA_USER_B_SESSION: env.EPMO_ENTRA_USER_A_SESSION },
    { EPMO_ENTRA_USER_A_SESSION: 'x\\r\\nAuthorization: bearer stolen' },
  ]) assert.throws(() => validateEntraAcceptanceConfig({ ...env, ...change }));
});

test('runs read-only two-user boundary with real Graph-shaped response contract', async () => {
  const { fetcher, calls } = fakeFetch();
  const result = await runEntraTwoUserReadOnly(cfg(), fetcher);
  assert.equal(result.passed, true);
  assert.equal(result.checks.length, 6);
  assert.equal(calls.length, 7);
  assert.ok(calls.every(c => c.method === 'GET' && c.redirect === 'manual'));
  assert.deepEqual(calls.filter(c => c.path.endsWith('/places')).map(c => [c.owner, c.other]),
    [[false, true], [true, false]]);
});

test('fails closed when two staging sessions resolve to same identity', async () => {
  const { fetcher } = fakeFetch({
    '/auth/session:B': reply(200, principal(a)),
  });
  await assert.rejects(runEntraTwoUserReadOnly(cfg(), fetcher), /identity/);
});

test('fails closed on non-owner Graph access or leaked owner metadata', async () => {
  const { fetcher } = fakeFetch({
    '/api/v1/microsoft/places:B': reply(200, { sites: [], oneDrive: null }),
  });
  await assert.rejects(runEntraTwoUserReadOnly(cfg(), fetcher), /boundary/);
  const { fetcher: leaked } = fakeFetch({
    '/api/v1/microsoft/status:B': reply(200, {
      configured: true, connection: {
        status: 'connected', accountEmail: 'private@example.test',
        scopes: 'Files.ReadWrite.All', lastError: null,
      },
    }),
  });
  await assert.rejects(runEntraTwoUserReadOnly(cfg(), leaked), /redaction/);
});

test('rejects redirect, oversized and malformed upstream responses', async () => {
  for (const response of [
    new Response(null, { status: 302, headers: { location: 'https://attacker.example/' } }),
    new Response('x'.repeat(66000), { status: 200 }),
    new Response('{invalid', { status: 200 }),
  ]) {
    const { fetcher } = fakeFetch({ '/auth/session:A': response });
    await assert.rejects(runEntraTwoUserReadOnly(cfg(), fetcher));
  }
});

test('sanitizes failure output and never includes cookies or provider payloads', () => {
  const message = safeEntraAcceptanceFailure(new Error(
    'token=' + env.EPMO_ENTRA_USER_A_SESSION + ' secret and Graph failure'));
  assert.ok(message.startsWith('BLOCKED E41'));
  assert.ok(!message.includes(env.EPMO_ENTRA_USER_A_SESSION));
  assert.ok(!message.includes('secret'));
});

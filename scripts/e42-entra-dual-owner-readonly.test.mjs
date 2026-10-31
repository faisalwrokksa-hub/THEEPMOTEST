import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateTwoOwnerConfig, runTwoOwnerReadOnly, safeTwoOwnerFailure,
} from './e42-entra-dual-owner-readonly.mjs';

const ta = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const tb = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ua = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const ub = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const ca = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const cb = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const env = {
  DEPLOYMENT_ENV: 'staging', NODE_ENV: 'test',
  EPMO_ENTRA_TWO_OWNER_ACCEPTANCE: 'YES_READ_ONLY_STAGING_ENTRA_TWO_OWNERS',
  EPMO_ENTRA_STAGING_ORIGIN: 'https://staging.theepmo.com',
  EPMO_ENTRA_OWNER_A_TENANT_ID: ta, EPMO_ENTRA_OWNER_B_TENANT_ID: tb,
  EPMO_ENTRA_OWNER_A_USER_ID: ua, EPMO_ENTRA_OWNER_B_USER_ID: ub,
  EPMO_ENTRA_OWNER_A_SESSION: 'A'.repeat(48),
  EPMO_ENTRA_OWNER_B_SESSION: 'B'.repeat(48),
  EPMO_ENTRA_OWNER_A_ACCOUNT_EMAIL: 'a@example.test',
  EPMO_ENTRA_OWNER_B_ACCOUNT_EMAIL: 'b@example.test',
};
const config = () => validateTwoOwnerConfig(env);
const reply = (status, data) => new Response(JSON.stringify(data), {
  status, headers: { 'content-type': 'application/json' },
});
function fakeFetch(overrides = {}) {
  const calls = [];
  const fetcher = async (url, init) => {
    const path = new URL(url).pathname;
    const cookie = init.headers.cookie;
    const who = cookie === 'pmo_session=' + env.EPMO_ENTRA_OWNER_A_SESSION ? 'A'
      : cookie === 'pmo_session=' + env.EPMO_ENTRA_OWNER_B_SESSION ? 'B' : 'none';
    calls.push({ path, who, method: init.method, redirect: init.redirect });
    const key = path + ':' + who;
    if (Object.hasOwn(overrides, key)) return overrides[key];
    if (who === 'none') return reply(401, { error: 'Unauthorized' });
    if (path === '/auth/session')
      return reply(200, { authenticated: true, tenantId: who === 'A' ? ta : tb,
        userId: who === 'A' ? ua : ub, capabilities: ['pmoa_admin'] });
    if (path === '/api/v1/microsoft/status')
      return reply(200, { configured: true, connection: {
        id: who === 'A' ? ca : cb, status: 'connected',
        accountEmail: who === 'A' ? 'a@example.test' : 'b@example.test',
      } });
    if (path === '/api/v1/microsoft/places')
      return reply(200, { sites: [], oneDrive: null });
    return reply(404, {});
  };
  return { fetcher, calls };
}

test('requires explicit staging authorization and two distinct complete owners', () => {
  assert.equal(config().owners.length, 2);
  for (const patch of [
    { DEPLOYMENT_ENV: 'production' }, { NODE_ENV: 'production' },
    { EPMO_ENTRA_TWO_OWNER_ACCEPTANCE: '' },
    { EPMO_ENTRA_STAGING_ORIGIN: 'https://theepmo.com' },
    { EPMO_ENTRA_STAGING_ORIGIN: 'http://staging.theepmo.com' },
    { EPMO_ENTRA_STAGING_ORIGIN: 'https://staging.theepmo.com:8443' },
    { EPMO_ENTRA_STAGING_ORIGIN: 'https://staging.theepmo.com/x' },
    { EPMO_ENTRA_OWNER_B_TENANT_ID: ta },
    { EPMO_ENTRA_OWNER_B_USER_ID: ua },
    { EPMO_ENTRA_OWNER_B_SESSION: env.EPMO_ENTRA_OWNER_A_SESSION },
    { EPMO_ENTRA_OWNER_B_ACCOUNT_EMAIL: 'A@EXAMPLE.TEST' },
    { EPMO_ENTRA_OWNER_B_ACCOUNT_EMAIL: 'x\r\nBearer secret' },
  ]) assert.throws(() => validateTwoOwnerConfig({ ...env, ...patch }));
});

test('reads two separate delegated owners without mutations or redirects', async () => {
  const { fetcher, calls } = fakeFetch();
  const result = await runTwoOwnerReadOnly(config(), fetcher);
  assert.equal(result.passed, true);
  assert.equal(result.checks.length, 7);
  assert.equal(calls.length, 8);
  assert.ok(calls.every(c => c.method === 'GET' && c.redirect === 'manual'));
  assert.deepEqual(calls.filter(c => c.path.endsWith('/places')).map(c => c.who),
    ['none', 'A', 'B']);
});

test('rejects tenant confusion, reused connection and mismatched Microsoft account', async () => {
  for (const overrides of [
    { '/auth/session:B': reply(200, { authenticated: true, tenantId: ta,
      userId: ub, capabilities: ['pmoa_admin'] }) },
    { '/api/v1/microsoft/status:B': reply(200, { configured: true,
      connection: { id: ca, status: 'connected', accountEmail: 'b@example.test' } }) },
    { '/api/v1/microsoft/status:B': reply(200, { configured: true,
      connection: { id: cb, status: 'connected', accountEmail: 'a@example.test' } }) },
  ]) {
    const { fetcher } = fakeFetch(overrides);
    await assert.rejects(runTwoOwnerReadOnly(config(), fetcher));
  }
});

test('rejects anonymous access, inactive connections and Graph read failures', async () => {
  for (const overrides of [
    { '/api/v1/microsoft/status:none': reply(200, {}) },
    { '/api/v1/microsoft/places:none': reply(200, { sites: [], oneDrive: null }) },
    { '/api/v1/microsoft/status:A': reply(200, { configured: true,
      connection: { id: ca, status: 'revoked', accountEmail: 'a@example.test' } }) },
    { '/api/v1/microsoft/places:B': reply(403, {}) },
  ]) {
    const { fetcher } = fakeFetch(overrides);
    await assert.rejects(runTwoOwnerReadOnly(config(), fetcher));
  }
});

test('fails closed on credential fields, redirects, oversized and malformed JSON', async () => {
  for (const response of [
    reply(200, { configured: true, connection: { id: ca, status: 'connected',
      accountEmail: 'a@example.test', refreshToken: 'should-never-return' } }),
    new Response(null, { status: 302, headers: { location: 'https://example.org' } }),
    new Response('x'.repeat(65537), { status: 200,
      headers: { 'content-type': 'application/json' } }),
    new Response('{broken', { status: 200,
      headers: { 'content-type': 'application/json' } }),
    new Response('{}', { status: 200, headers: { 'content-type': 'text/plain' } }),
  ]) {
    const { fetcher } = fakeFetch({ '/api/v1/microsoft/status:A': response });
    await assert.rejects(runTwoOwnerReadOnly(config(), fetcher));
  }
});

test('failure messages never echo session tokens or provider error details', () => {
  const output = safeTwoOwnerFailure(new Error(
    'Graph rejected ' + env.EPMO_ENTRA_OWNER_A_SESSION + ' private response'));
  assert.match(output, /^BLOCKED E42/);
  assert.ok(!output.includes(env.EPMO_ENTRA_OWNER_A_SESSION));
  assert.ok(!output.includes('private'));
});

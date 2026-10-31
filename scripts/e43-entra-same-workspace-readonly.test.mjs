import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateSameWorkspaceConfig, runSameWorkspaceReadOnly, safeSameWorkspaceFailure,
} from './e43-entra-same-workspace-readonly.mjs';

const ta = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const tc = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const users = ['cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'];
const conns = ['11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333'];
const env = {
  DEPLOYMENT_ENV: 'staging', NODE_ENV: 'test',
  EPMO_ENTRA_SAME_WORKSPACE_ACCEPTANCE: 'YES_READ_ONLY_STAGING_ENTRA_SAME_WORKSPACE',
  EPMO_ENTRA_STAGING_ORIGIN: 'https://staging.theepmo.com',
  EPMO_ENTRA_PHASE: 'active',
};
for (const [i, key] of ['A', 'B', 'C'].entries()) {
  env['EPMO_ENTRA_' + key + '_TENANT_ID'] = i === 2 ? tc : ta;
  env['EPMO_ENTRA_' + key + '_USER_ID'] = users[i];
  env['EPMO_ENTRA_' + key + '_SESSION'] = key.repeat(48);
  env['EPMO_ENTRA_' + key + '_ACCOUNT_EMAIL'] = key.toLowerCase() + '@example.test';
  env['EPMO_ENTRA_' + key + '_CONNECTION_ID'] = conns[i];
  env['EPMO_ENTRA_' + key + '_DRIVE_ID'] = 'drive-' + key + '-unique';
}
const cfg = phase => validateSameWorkspaceConfig({ ...env, EPMO_ENTRA_PHASE: phase });
const reply = (status, data) => new Response(JSON.stringify(data), {
  status, headers: { 'content-type': 'application/json' },
});
function fakeFetch(phase = 'active', overrides = {}) {
  const calls = [];
  const fetcher = async (url, init) => {
    const parsed = new URL(url);
    const path = parsed.pathname + parsed.search;
    const cookie = init.headers.cookie;
    const who = ['A', 'B', 'C'].find(key =>
      cookie === 'pmo_session=' + env['EPMO_ENTRA_' + key + '_SESSION']) || 'none';
    calls.push({ path, who, method: init.method, redirect: init.redirect, cache: init.cache });
    const override = overrides[path + ':' + who];
    if (override) return override();
    if (who === 'none') return reply(401, { error: 'Unauthorized' });
    const i = ['A', 'B', 'C'].indexOf(who);
    if (parsed.pathname === '/auth/session')
      return reply(200, { authenticated: true, tenantId: i === 2 ? tc : ta,
        userId: users[i], capabilities: ['pmoa_admin'] });
    if (parsed.pathname === '/api/v1/microsoft/status')
      return reply(200, { configured: true, connection: {
        id: conns[i], status: phase === 'revoked' && who === 'A' ? 'error' : 'connected',
        accountEmail: who.toLowerCase() + '@example.test',
      } });
    if (parsed.pathname === '/api/v1/microsoft/places')
      return phase === 'revoked' && who === 'A'
        ? reply(409, { error: 'Reconnect' })
        : reply(200, { sites: [], oneDrive: { driveId: 'drive-' + who + '-unique' } });
    return reply(404, {});
  };
  return { fetcher, calls };
}

test('fail-closed configuration requires two owners in one workspace and foreign tenant C', () => {
  assert.equal(cfg('active').owners[0].tenantId, cfg('active').owners[1].tenantId);
  assert.equal(cfg('revoked').phase, 'revoked');
  for (const patch of [
    { DEPLOYMENT_ENV: 'production' }, { NODE_ENV: 'production' },
    { EPMO_ENTRA_SAME_WORKSPACE_ACCEPTANCE: '' },
    { EPMO_ENTRA_STAGING_ORIGIN: 'https://theepmo.com' },
    { EPMO_ENTRA_STAGING_ORIGIN: 'https://api.theepmo.com' },
    { EPMO_ENTRA_STAGING_ORIGIN: 'http://staging.theepmo.com' },
    { EPMO_ENTRA_STAGING_ORIGIN: 'https://staging.theepmo.com:8443' },
    { EPMO_ENTRA_STAGING_ORIGIN: 'https://staging.theepmo.com/other' },
    { EPMO_ENTRA_PHASE: 'unknown' },
    { EPMO_ENTRA_B_TENANT_ID: tc }, { EPMO_ENTRA_C_TENANT_ID: ta },
    { EPMO_ENTRA_B_USER_ID: users[0] },
    { EPMO_ENTRA_B_CONNECTION_ID: conns[0] },
    { EPMO_ENTRA_B_SESSION: env.EPMO_ENTRA_A_SESSION },
    { EPMO_ENTRA_B_ACCOUNT_EMAIL: 'A@EXAMPLE.TEST' },
    { EPMO_ENTRA_C_DRIVE_ID: env.EPMO_ENTRA_A_DRIVE_ID },
    { EPMO_ENTRA_A_SESSION: 'bad\r\nCookie: pmo_session=stolen' },
  ]) assert.throws(() => validateSameWorkspaceConfig({ ...env, ...patch }));
});

test('active phase checks same-workspace owners, third tenant and no mutation', async () => {
  const { fetcher, calls } = fakeFetch();
  const result = await runSameWorkspaceReadOnly(cfg('active'), fetcher);
  assert.equal(result.passed, true);
  assert.equal(result.checks.length, 9);
  assert.equal(calls.length, 15);
  assert.ok(calls.every(c => c.method === 'GET' && c.redirect === 'manual' &&
    c.cache === 'no-store'));
  assert.equal(calls.filter(c => c.path.startsWith('/api/v1/microsoft/places')).length, 6);
});

test('revoked phase denies A cached Graph token but preserves B and C', async () => {
  const { fetcher, calls } = fakeFetch('revoked');
  const result = await runSameWorkspaceReadOnly(cfg('revoked'), fetcher);
  assert.equal(result.passed, true);
  assert.equal(result.checks.at(-1), 'revoked A denied while B and C remain usable');
  assert.equal(calls.filter(c => c.path.startsWith('/api/v1/microsoft/places') &&
    c.who === 'A').length, 2);
});

test('rejects same-workspace account alias, wrong principal and cross-tenant borrowing', async () => {
  for (const overrides of [
    { '/api/v1/microsoft/status:B': () => reply(200, { configured: true,
      connection: { id: conns[0], status: 'connected', accountEmail: 'a@example.test' } }) },
    { '/auth/session:B': () => reply(200, { authenticated: true,
      tenantId: tc, userId: users[1], capabilities: ['pmoa_admin'] }) },
    { ['/api/v1/microsoft/status?tenantId=' + ta + '&workspaceId=' + ta + ':C']:
      () => reply(200, { configured: true,
        connection: { id: conns[0], status: 'connected', accountEmail: 'a@example.test' } }) },
    { ['/api/v1/microsoft/places?tenantId=' + ta + '&workspaceId=' + ta + ':C']:
      () => reply(200, { sites: [], oneDrive: { driveId: 'drive-A-unique' } }) },
    { ['/api/v1/microsoft/places?userId=' + users[1] + ':A']:
      () => reply(200, { sites: [], oneDrive: { driveId: 'drive-B-unique' } }) },
  ]) {
    const { fetcher } = fakeFetch('active', overrides);
    await assert.rejects(runSameWorkspaceReadOnly(cfg('active'), fetcher));
  }
});

test('rejects revoked access token reuse and failed independent owner', async () => {
  for (const overrides of [
    { '/api/v1/microsoft/places:A': () => reply(200, {
      sites: [], oneDrive: { driveId: 'drive-A-unique' } }) },
    { '/api/v1/microsoft/status:B': () => reply(200, { configured: true,
      connection: { id: conns[1], status: 'error', accountEmail: 'b@example.test' } }) },
  ]) {
    const { fetcher } = fakeFetch('revoked', overrides);
    await assert.rejects(runSameWorkspaceReadOnly(cfg('revoked'), fetcher));
  }
});

test('rejects redirects, leaked credentials, oversized and malformed JSON', async () => {
  for (const response of [
    () => new Response(null, { status: 302,
      headers: { location: 'https://untrusted.example/' } }),
    () => reply(200, { configured: true, connection: {
      id: conns[0], status: 'connected', accountEmail: 'a@example.test',
      refreshToken: 'never-leak' } }),
    () => new Response('x'.repeat(65537), { status: 200,
      headers: { 'content-type': 'application/json' } }),
    () => new Response('{broken', { status: 200,
      headers: { 'content-type': 'application/json' } }),
    () => new Response('{}', { status: 200,
      headers: { 'content-type': 'text/plain' } }),
    () => reply(200, { configured: true, connection: {
      id: conns[0], status: 'connected', accountEmail: 'a@example.test',
      nested: { cookie: env.EPMO_ENTRA_A_SESSION } } }),
  ]) {
    const { fetcher } = fakeFetch('active', { '/api/v1/microsoft/status:A': response });
    await assert.rejects(runSameWorkspaceReadOnly(cfg('active'), fetcher));
  }
});

test('never logs provider payloads, session cookies or error stack details', () => {
  const raw = new Error('Graph token=' + env.EPMO_ENTRA_A_SESSION + ' private');
  const output = safeSameWorkspaceFailure(raw);
  assert.match(output, /^BLOCKED E43/);
  assert.ok(!output.includes(env.EPMO_ENTRA_A_SESSION));
  assert.ok(!output.includes('private'));
});

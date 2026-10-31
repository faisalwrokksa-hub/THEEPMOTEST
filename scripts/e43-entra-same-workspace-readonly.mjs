/**
 * E43: read-only staging acceptance for two *independently consenting* users in
 * ONE EPMO workspace, plus a third consenting user in another workspace.
 *
 * Run once with EPMO_ENTRA_PHASE=active. After an authorized staging operator
 * independently prepares A's revoked/errored fixture, run with phase=revoked.
 * Never obtains consent, revokes credentials, logs cookies or mutates data.
 * Synthetic tests do NOT constitute Entra or staging acceptance receipts.
 */
import { fileURLToPath } from 'node:url';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SESSION = /^[A-Za-z0-9_-]{32,160}$/;
const EMAIL = /^[A-Za-z0-9.!#$%&'*+/=?^_\u0060{|}~-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/;
const DRIVE = /^[A-Za-z0-9!._-]{8,160}$/;
const OPT_IN = 'YES_READ_ONLY_STAGING_ENTRA_SAME_WORKSPACE';
const LIMIT = 65536;
const fail = code => { const error = new Error(code); error.code = code; throw error; };

export function validateSameWorkspaceConfig(env) {
  if (env.DEPLOYMENT_ENV !== 'staging' || env.NODE_ENV === 'production' ||
      env.EPMO_ENTRA_SAME_WORKSPACE_ACCEPTANCE !== OPT_IN)
    fail('CONFIG');
  let origin;
  try { origin = new URL(env.EPMO_ENTRA_STAGING_ORIGIN); }
  catch { fail('CONFIG'); }
  const host = origin.hostname.toLowerCase();
  if (origin.protocol !== 'https:' ||
      !(host === 'staging.theepmo.com' || host.endsWith('.staging.theepmo.com')) ||
      origin.port || origin.username || origin.password || origin.pathname !== '/' ||
      origin.search || origin.hash) fail('CONFIG');
  const phase = env.EPMO_ENTRA_PHASE;
  if (phase !== 'active' && phase !== 'revoked') fail('CONFIG');

  const owners = ['A', 'B', 'C'].map(key => ({
    key,
    tenantId: env['EPMO_ENTRA_' + key + '_TENANT_ID'],
    userId: env['EPMO_ENTRA_' + key + '_USER_ID'],
    session: env['EPMO_ENTRA_' + key + '_SESSION'],
    accountEmail: env['EPMO_ENTRA_' + key + '_ACCOUNT_EMAIL'],
    connectionId: env['EPMO_ENTRA_' + key + '_CONNECTION_ID'],
    driveId: env['EPMO_ENTRA_' + key + '_DRIVE_ID'],
  }));
  if (owners.some(o => !UUID.test(o.tenantId || '') || !UUID.test(o.userId || '') ||
      !UUID.test(o.connectionId || '') || !SESSION.test(o.session || '') ||
      typeof o.accountEmail !== 'string' || o.accountEmail.length > 254 ||
      !EMAIL.test(o.accountEmail) || !DRIVE.test(o.driveId || ''))) fail('CONFIG');
  if (owners[0].tenantId.toLowerCase() !== owners[1].tenantId.toLowerCase() ||
      owners[0].tenantId.toLowerCase() === owners[2].tenantId.toLowerCase()) fail('CONFIG');
  for (const property of ['userId', 'session', 'accountEmail', 'connectionId', 'driveId']) {
    const values = owners.map(o => String(o[property]).toLowerCase());
    if (new Set(values).size !== 3) fail('CONFIG');
  }
  return { origin: origin.origin, phase, owners };
}

function noSecrets(value, sessions) {
  const secretKeys = new Set(['accesstoken', 'refreshtoken', 'idtoken', 'clientsecret',
    'tokenkey', 'authorization', 'cookie', 'setcookie', 'password', 'credential', 'secret']);
  const visit = (node, depth) => {
    if (depth > 12) fail('RESPONSE');
    if (typeof node === 'string' && sessions.some(s => node.includes(s))) fail('RESPONSE');
    if (node && typeof node === 'object') {
      for (const [key, child] of Object.entries(node)) {
        if (secretKeys.has(key.replace(/[^a-z]/gi, '').toLowerCase())) fail('RESPONSE');
        visit(child, depth + 1);
      }
    }
  };
  visit(value, 0);
}

async function boundedJson(response, sessions) {
  const declared = response.headers?.get?.('content-length');
  if (declared != null && (!/^\d+$/.test(declared) || Number(declared) > LIMIT))
    fail('RESPONSE');
  if (!/^application\/json(?:\s*;|$)/i.test(response.headers?.get?.('content-type') || ''))
    fail('RESPONSE');
  const reader = response.body?.getReader?.();
  if (!reader) fail('RESPONSE');
  const parts = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > LIMIT) fail('RESPONSE');
      parts.push(value);
    }
  } finally { await reader.cancel().catch(() => {}); }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) { bytes.set(part, offset); offset += part.byteLength; }
  let data;
  try { data = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { fail('RESPONSE'); }
  if (!data || typeof data !== 'object' || Array.isArray(data)) fail('RESPONSE');
  noSecrets(data, sessions);
  return data;
}

function assertConnection(status, owner, expectedStatus) {
  const c = status?.connection;
  if (status?.configured !== true || !c || typeof c !== 'object' ||
      c.id?.toLowerCase() !== owner.connectionId.toLowerCase() ||
      c.status !== expectedStatus ||
      typeof c.accountEmail !== 'string' ||
      c.accountEmail.toLowerCase() !== owner.accountEmail.toLowerCase())
    fail('BOUNDARY');
}

function assertGraph(places, owner) {
  if (!Array.isArray(places?.sites) || !places?.oneDrive ||
      places.oneDrive.driveId !== owner.driveId) fail('PROVIDER');
}

export async function runSameWorkspaceReadOnly(config, fetcher = fetch) {
  const [a, b, c] = config.owners;
  const sessions = config.owners.map(o => o.session);
  const get = async (path, session, expectedStatus) => {
    const response = await fetcher(config.origin + path, {
      method: 'GET', redirect: 'manual', cache: 'no-store',
      signal: AbortSignal.timeout(15000),
      headers: { accept: 'application/json',
        ...(session ? { cookie: 'pmo_session=' + session } : {}) },
    });
    if (response.status !== expectedStatus || response.status >= 300 && response.status < 400)
      fail('BOUNDARY');
    if (expectedStatus !== 200) {
      await response.body?.cancel?.().catch(() => {});
      return null;
    }
    return boundedJson(response, sessions);
  };

  await get('/api/v1/microsoft/status', null, 401);
  await get('/api/v1/microsoft/places', null, 401);
  for (const owner of config.owners) {
    const principal = await get('/auth/session', owner.session, 200);
    if (principal.authenticated !== true ||
        principal.tenantId?.toLowerCase() !== owner.tenantId.toLowerCase() ||
        principal.userId?.toLowerCase() !== owner.userId.toLowerCase() ||
        !Array.isArray(principal.capabilities) ||
        !principal.capabilities.includes('pmoa_admin')) fail('AUTH');
  }

  for (const owner of config.owners) {
    const expectedStatus = config.phase === 'revoked' && owner.key === 'A'
      ? 'error' : 'connected';
    assertConnection(await get('/api/v1/microsoft/status', owner.session, 200),
      owner, expectedStatus);
    if (expectedStatus === 'error') {
      // A's previously cached Graph token must not remain usable after revocation.
      await get('/api/v1/microsoft/places', owner.session, 409);
    } else {
      assertGraph(await get('/api/v1/microsoft/places', owner.session, 200), owner);
    }
  }

  // A cannot impersonate B by changing userId. In the revoked phase, A must
  // remain revoked even when trying to borrow B's active connection.
  const userOverride = '?userId=' + encodeURIComponent(b.userId);
  assertConnection(await get('/api/v1/microsoft/status' + userOverride, a.session, 200),
    a, config.phase === 'revoked' ? 'error' : 'connected');
  if (config.phase === 'revoked') {
    await get('/api/v1/microsoft/places' + userOverride, a.session, 409);
  } else {
    assertGraph(await get('/api/v1/microsoft/places' + userOverride, a.session, 200), a);
  }

  // A foreign workspace selector must not let C borrow A/B's Microsoft identity.
  const tenantOverride = '?tenantId=' + encodeURIComponent(a.tenantId) +
    '&workspaceId=' + encodeURIComponent(a.tenantId);
  assertConnection(await get('/api/v1/microsoft/status' + tenantOverride, c.session, 200),
    c, 'connected');
  assertGraph(await get('/api/v1/microsoft/places' + tenantOverride, c.session, 200), c);

  return {
    passed: true,
    phase: config.phase,
    checks: ['anonymous denied', 'two distinct delegated owners in one workspace',
      'third owner in isolated workspace', 'three independent Microsoft connection IDs',
      'per-owner bounded Graph reads', 'foreign user override denied',
      'cross-tenant override denied', 'credential fields redacted',
      config.phase === 'revoked' ? 'revoked A denied while B and C remain usable'
        : 'active owners usable before external revocation'],
    limitation: 'Read-only acceptance only; external consent, provider identity, revocation setup and independent staging receipts required',
  };
}

export function safeSameWorkspaceFailure(error) {
  const code = error?.code;
  const category = code === 'CONFIG' ? 'missing or unsafe staging fixtures'
    : code === 'AUTH' ? 'staging session or workspace identity mismatch'
    : code === 'BOUNDARY' ? 'delegated connection or tenant boundary failed'
    : code === 'PROVIDER' ? 'Graph owner-specific read failed'
    : 'staging response, provider or security check failed';
  return 'BLOCKED E43 Entra same-workspace acceptance: ' + category;
}

async function main() {
  try {
    const result = await runSameWorkspaceReadOnly(validateSameWorkspaceConfig(process.env));
    console.log('PASS E43 read-only same-workspace phase ' + result.phase +
      ': ' + result.checks.length + ' checks');
    console.log('LIMIT: ' + result.limitation);
  } catch (error) {
    console.error(safeSameWorkspaceFailure(error));
    process.exitCode = 1;
  }
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();

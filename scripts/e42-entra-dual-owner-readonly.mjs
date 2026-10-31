/**
 * E42: read-only, dual-owner Microsoft delegated staging probe.
 * Unlike E41 (same-workspace owner/non-owner), this checks two consenting
 * owners in distinct EPMO staging tenants. It never initiates consent or writes.
 * Does not prove same-workspace multi-connection support or provider consent.
 */
import { fileURLToPath } from 'node:url';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SESSION = /^[A-Za-z0-9_-]{32,160}$/;
const EMAIL = /^[A-Za-z0-9.!#$%&'*+/=?^_\u0060{|}~-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/;
const OPT_IN = 'YES_READ_ONLY_STAGING_ENTRA_TWO_OWNERS';
const fail = message => { throw new Error(message); };

export function validateTwoOwnerConfig(env) {
  if (env.DEPLOYMENT_ENV !== 'staging' || env.NODE_ENV === 'production' ||
      env.EPMO_ENTRA_TWO_OWNER_ACCEPTANCE !== OPT_IN)
    fail('Explicit nonproduction staging read-only authorization required');
  let origin;
  try { origin = new URL(env.EPMO_ENTRA_STAGING_ORIGIN); }
  catch { fail('Invalid staging origin'); }
  if (origin.protocol !== 'https:' || !origin.hostname.endsWith('.theepmo.com') ||
      origin.hostname === 'www.theepmo.com' || origin.port || origin.username ||
      origin.password || origin.pathname !== '/' || origin.search || origin.hash)
    fail('Dedicated HTTPS staging origin required');
  const owners = ['A', 'B'].map(suffix => ({
    tenantId: env['EPMO_ENTRA_OWNER_' + suffix + '_TENANT_ID'],
    userId: env['EPMO_ENTRA_OWNER_' + suffix + '_USER_ID'],
    session: env['EPMO_ENTRA_OWNER_' + suffix + '_SESSION'],
    accountEmail: env['EPMO_ENTRA_OWNER_' + suffix + '_ACCOUNT_EMAIL'],
  }));
  if (owners.some(o => !UUID.test(o.tenantId || '') || !UUID.test(o.userId || '') ||
      !SESSION.test(o.session || '') || typeof o.accountEmail !== 'string' ||
      o.accountEmail.length > 254 || !EMAIL.test(o.accountEmail)))
    fail('Two complete distinct staging owner fixtures required');
  if (owners[0].tenantId.toLowerCase() === owners[1].tenantId.toLowerCase() ||
      owners[0].userId.toLowerCase() === owners[1].userId.toLowerCase() ||
      owners[0].session === owners[1].session ||
      owners[0].accountEmail.toLowerCase() === owners[1].accountEmail.toLowerCase())
    fail('Two distinct tenants, users, sessions and Microsoft accounts required');
  return { origin: origin.origin, owners };
}

async function boundedJson(response) {
  const length = response.headers?.get?.('content-length');
  if (length != null && (!/^\d+$/.test(length) || Number(length) > 65536))
    fail('Invalid or oversized staging response');
  if (!/^application\/json(?:\s*;|$)/i.test(response.headers?.get?.('content-type') || ''))
    fail('Staging response must be JSON');
  const reader = response.body?.getReader?.();
  if (!reader) fail('Missing staging JSON body');
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 65536) fail('Oversized staging JSON body');
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => {}); }
  const buffer = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.byteLength; }
  let data;
  try { data = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(buffer)); }
  catch { fail('Invalid staging JSON body'); }
  if (data === null || typeof data !== 'object' || Array.isArray(data))
    fail('Staging JSON must be an object');
  return data;
}

function assertNoCredentialFields(value) {
  const forbidden = /^(access_?token|refresh_?token|id_?token|client_?secret|token_?key)$/i;
  const visit = (item, depth) => {
    if (depth > 12) fail('Unexpected staging response nesting');
    if (item && typeof item === 'object') {
      for (const [key, child] of Object.entries(item)) {
        if (forbidden.test(key)) fail('Staging metadata contains a credential field');
        visit(child, depth + 1);
      }
    }
  };
  visit(value, 0);
}

export async function runTwoOwnerReadOnly(config, fetcher = fetch) {
  const get = async (path, session, expected) => {
    const response = await fetcher(config.origin + path, {
      method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(15000),
      headers: { accept: 'application/json',
        ...(session ? { cookie: 'pmo_session=' + session } : {}) },
    });
    if (response.status !== expected || (response.status >= 300 && response.status < 400))
      fail('Staging authorization or provider boundary failed');
    if (expected !== 200) {
      await response.body?.cancel?.().catch(() => {});
      return null;
    }
    return boundedJson(response);
  };
  await get('/api/v1/microsoft/status', null, 401);
  await get('/api/v1/microsoft/places', null, 401);
  const connections = [];
  for (const owner of config.owners) {
    const principal = await get('/auth/session', owner.session, 200);
    if (principal.authenticated !== true || principal.tenantId !== owner.tenantId ||
        principal.userId !== owner.userId || !Array.isArray(principal.capabilities) ||
        !principal.capabilities.includes('pmoa_admin'))
      fail('Staging owner session or tenant identity mismatch');
    const status = await get('/api/v1/microsoft/status', owner.session, 200);
    assertNoCredentialFields(status);
    if (status.configured !== true || status.connection?.status !== 'connected' ||
        !UUID.test(status.connection.id || '') ||
        typeof status.connection.accountEmail !== 'string' ||
        status.connection.accountEmail.toLowerCase() !== owner.accountEmail.toLowerCase())
      fail('Expected owner delegated connection not visible');
    connections.push(status.connection.id.toLowerCase());
    const places = await get('/api/v1/microsoft/places', owner.session, 200);
    assertNoCredentialFields(places);
    if (!Array.isArray(places.sites) || !Object.hasOwn(places, 'oneDrive'))
      fail('Owner Graph read response contract failed');
  }
  if (connections[0] === connections[1])
    fail('Two staging owners resolved to the same connection record');
  return {
    passed: true,
    checks: ['anonymous Microsoft status denied', 'anonymous Graph denied',
      'two distinct staging tenants and users', 'two separate delegated connections',
      'two distinct Microsoft account identities', 'both owner Graph API reads succeeded',
      'credential fields absent from returned metadata'],
    limitation: 'Read-only two-tenant owner probe; same-workspace multi-owner consent and independent Entra receipts remain unverified',
  };
}

export function safeTwoOwnerFailure(error) {
  const message = String(error?.message || '');
  return 'BLOCKED E42 read-only dual-owner Entra acceptance: ' +
    (/authorization|origin|fixtures|distinct/i.test(message)
      ? 'missing or unsafe staging fixtures'
      : /Graph|provider/i.test(message)
        ? 'Graph provider or permission boundary failed'
        : 'staging identity, connection, response or security check failed');
}

async function main() {
  try {
    const result = await runTwoOwnerReadOnly(validateTwoOwnerConfig(process.env));
    console.log('PASS E42 dual-owner read-only staging API checks: ' + result.checks.length);
    console.log('LIMIT: ' + result.limitation);
  } catch (error) {
    console.error(safeTwoOwnerFailure(error));
    process.exitCode = 1;
  }
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();

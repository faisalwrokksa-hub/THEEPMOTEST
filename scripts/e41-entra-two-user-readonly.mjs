/**
 * E41: read-only, two-distinct-user Microsoft delegated staging acceptance.
 * No login, consent, OAuth callback, disconnect, upload or mutation is performed.
 * Uses existing short-lived staging sessions supplied via a secure runner.
 * This proves one consenting owner can use Graph while another administrator
 * in the SAME workspace cannot borrow that delegated identity. It does NOT
 * prove that two users can simultaneously own separate Microsoft connections.
 */
import { fileURLToPath } from 'node:url';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SESSION = /^[A-Za-z0-9_-]{32,160}$/;
const OPT_IN = 'YES_READ_ONLY_STAGING_ENTRA_TWO_USER';
const fail = message => { throw new Error(message); };

export function validateEntraAcceptanceConfig(env) {
  if (env.DEPLOYMENT_ENV !== 'staging' || env.NODE_ENV === 'production' ||
      env.EPMO_ENTRA_READONLY_ACCEPTANCE !== OPT_IN)
    fail('Explicit nonproduction staging Entra read-only authorization required');
  let origin;
  try { origin = new URL(env.EPMO_ENTRA_STAGING_ORIGIN); }
  catch { fail('Invalid staging HTTPS origin'); }
  if (origin.protocol !== 'https:' || !origin.hostname.endsWith('.theepmo.com') ||
      origin.hostname === 'www.theepmo.com' || origin.port || origin.username ||
      origin.password || origin.pathname !== '/' || origin.search || origin.hash)
    fail('A dedicated public theepmo.com HTTPS staging origin is required');
  const tenantId = env.EPMO_ENTRA_EXPECTED_TENANT_ID;
  const userA = env.EPMO_ENTRA_EXPECTED_USER_A_ID;
  const userB = env.EPMO_ENTRA_EXPECTED_USER_B_ID;
  if (![tenantId, userA, userB].every(value => UUID.test(value || '')) ||
      userA.toLowerCase() === userB.toLowerCase())
    fail('Expected staging tenant and two distinct user UUIDs required');
  const sessionA = env.EPMO_ENTRA_USER_A_SESSION;
  const sessionB = env.EPMO_ENTRA_USER_B_SESSION;
  if (!SESSION.test(sessionA || '') || !SESSION.test(sessionB || '') || sessionA === sessionB)
    fail('Two distinct existing staging session tokens required');
  return { origin: origin.origin, tenantId, userA, userB, sessionA, sessionB };
}

async function readJsonBounded(response) {
  const declared = response.headers?.get?.('content-length');
  if (declared !== null && declared !== undefined &&
      (!/^\d+$/.test(declared) || Number(declared) > 65536))
    fail('Oversized or invalid staging response');
  const reader = response.body?.getReader?.();
  if (!reader) fail('Missing staging response body');
  const parts = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 65536) fail('Oversized staging response');
      parts.push(value);
    }
  } finally { await reader.cancel().catch(() => {}); }
  try {
    return JSON.parse(new TextDecoder().decode(
      Uint8Array.from(parts.flatMap(chunk => Array.from(chunk)))));
  } catch { fail('Invalid staging JSON response'); }
}

export async function runEntraTwoUserReadOnly(config, fetcher = fetch) {
  const request = async (path, session, expectedStatus) => {
    const response = await fetcher(config.origin + path, {
      method: 'GET',
      redirect: 'manual',
      signal: AbortSignal.timeout(15000),
      headers: {
        accept: 'application/json',
        ...(session ? { cookie: 'pmo_session=' + session } : {}),
      },
    });
    if (response.status !== expectedStatus || response.status >= 300 && response.status < 400)
      fail('Staging authentication or Microsoft boundary check failed');
    if (expectedStatus !== 200) {
      await response.body?.cancel?.().catch(() => {});
      return null;
    }
    return readJsonBounded(response);
  };
  const a = await request('/auth/session', config.sessionA, 200);
  const b = await request('/auth/session', config.sessionB, 200);
  for (const [p, id] of [[a, config.userA], [b, config.userB]]) {
    if (p?.authenticated !== true || p.userId !== id || p.tenantId !== config.tenantId ||
        !Array.isArray(p.capabilities) || !p.capabilities.includes('pmoa_admin'))
      fail('Staging session identity, tenant or administrator capability mismatch');
  }
  await request('/api/v1/microsoft/status', null, 401);
  const owner = await request('/api/v1/microsoft/status', config.sessionA, 200);
  const other = await request('/api/v1/microsoft/status', config.sessionB, 200);
  if (owner?.configured !== true || owner.connection?.status !== 'connected' ||
      typeof owner.connection.accountEmail !== 'string' || !owner.connection.accountEmail ||
      other?.configured !== true || other.connection?.status !== 'connected' ||
      other.connection.accountEmail !== null || other.connection.scopes !== null ||
      other.connection.lastError !== null)
    fail('Delegated connection owner visibility or non-owner redaction failed');
  // Exercise the actual provider boundary, not merely static status metadata.
  await request('/api/v1/microsoft/places', config.sessionB, 403);
  const places = await request('/api/v1/microsoft/places', config.sessionA, 200);
  if (!places || !Array.isArray(places.sites) || !('oneDrive' in places))
    fail('Consenting user Graph response did not satisfy the expected contract');
  return {
    passed: true, checks: ['distinct administrator sessions', 'same workspace',
      'anonymous API denied', 'non-owner metadata redacted',
      'non-owner Graph denied', 'owner Graph provider read succeeded'],
    limitation: 'Read-only two-user owner/non-owner boundary; not two separate delegated connections or admin consent',
  };
}

export function safeEntraAcceptanceFailure(error) {
  const message = typeof error?.message === 'string' ? error.message : '';
  return 'BLOCKED E41 Entra staging acceptance: ' +
    (message.includes('origin') || message.includes('authorization') ||
     message.includes('UUIDs') || message.includes('session tokens')
      ? 'missing or unsafe staging configuration'
      : message.includes('Graph') ? 'Graph provider or delegated permission check failed'
      : message.includes('session identity') ? 'test identity or workspace mismatch'
      : 'staging provider, response or security boundary verification failed');
}

async function main() {
  try {
    const result = await runEntraTwoUserReadOnly(validateEntraAcceptanceConfig(process.env));
    console.log('PASS E41 read-only Entra two-user owner/non-owner boundary: ' +
      result.checks.length + ' checks');
    console.log('LIMIT: ' + result.limitation);
  } catch (error) {
    console.error(safeEntraAcceptanceFailure(error));
    process.exitCode = 1;
  }
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();

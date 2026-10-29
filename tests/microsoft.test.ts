import { describe, it, expect, beforeAll } from 'vitest';
import { API, login, as, get, psql } from './helpers';
import { seal, open } from '../apps/api/src/microsoft/crypto';

// vitest does not load the server's .env, and the crypto helpers are imported
// here directly rather than reached through the API.
process.env.MS_TOKEN_KEY ??= 'dGVzdC1rZXktbm90LXRoZS1vbmUtcHJvZHVjdGlvbi11c2Vz';

/**
 * The Microsoft connection, as far as it can be exercised without Microsoft.
 *
 * A real round trip needs an app registration in Entra ID and a customer
 * tenant to consent in it, neither of which belongs in a test suite. What is
 * testable here is everything up to the redirect and everything after a
 * refusal: that the handshake cannot be replayed, that only an administrator
 * can start one, that the stored token is encrypted, and that every call made
 * before a connection exists says so rather than failing as a 500.
 */

let fatima: string, viewer: string;

/** Hits the callback, which deliberately sits outside /api. */
async function callback(params: Record<string, string>) {
  const u = new URL(`${API}/integrations/microsoft/callback`);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  const res = await fetch(u, { redirect: 'manual' });
  const location = res.headers.get('location') ?? '';
  // Read the message out of the query properly. decodeURIComponent leaves '+'
  // as a plus sign, so asserting against the raw string quietly passes against
  // any message at all — which is how a broken callback looked fine here once.
  const message = location ? new URL(location).searchParams.get('error') ?? '' : '';
  return { status: res.status, location, message };
}

async function send(path: string, method: string, body: unknown, token: string) {
  const res = await fetch(`${API}${path}`, {
    method, headers: { 'content-type': 'application/json', ...as(token) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

beforeAll(async () => {
  fatima = (await login('fatima@al-nakheel.test')).token!;
  viewer = (await login('pm@pmoalign.test')).token!;   // staff_consultant: no admin
  psql(`DELETE FROM oauth_states`);
  psql(`DELETE FROM integration_connections WHERE provider = 'microsoft'`);
}, 60_000);

describe('the stored refresh token', () => {
  it('does not survive a round trip as anything readable', () => {
    const secret = 'M.C5_BAY.0.U.-Cq9pretend-refresh-token';
    const sealed = seal(secret);
    expect(sealed).not.toContain(secret);
    expect(sealed.startsWith('v1.')).toBe(true);
    expect(open(sealed)).toBe(secret);
  });

  it('refuses to open a tampered token rather than returning rubbish', () => {
    // AES-GCM is authenticated, which is the whole reason for choosing it: a
    // flipped byte must fail loudly, not decrypt to a different string that
    // then gets sent to Microsoft.
    const sealed = seal('a-refresh-token');
    const [v, iv, tag, body] = sealed.split('.');
    const flipped = Buffer.from(body, 'base64');
    flipped[0] ^= 0x01;
    expect(() => open([v, iv, tag, flipped.toString('base64')].join('.'))).toThrow();
  });

  it('is never handed back by the API', async () => {
    const r = await get('/api/v1/microsoft/status', fatima);
    expect(r.status).toBe(200);
    expect(JSON.stringify(r.body)).not.toMatch(/refresh/i);
  });
});

describe('starting the handshake', () => {
  it('is refused to anyone who cannot administer the workspace', async () => {
    const r = await send('/api/v1/microsoft/connect', 'POST', { resource: 'graph' }, viewer);
    expect(r.status).toBe(403);
    // And nothing was written on the way to being refused.
    expect(Number(psql(`SELECT count(*) FROM oauth_states`))).toBe(0);
  });

  it('sends the administrator to Microsoft with the scopes it means to ask for', async () => {
    const r = await send('/api/v1/microsoft/connect', 'POST',
      { resource: 'graph', returnTo: '/integrations' }, fatima);
    expect(r.status).toBe(201);

    const u = new URL(r.body.url);
    expect(u.origin + u.pathname).toMatch(/login\.microsoftonline\.com\/.+\/oauth2\/v2\.0\/authorize$/);
    expect(u.searchParams.get('response_type')).toBe('code');

    const scopes = (u.searchParams.get('scope') ?? '').split(' ');
    // offline_access is what makes the connection outlive the first hour.
    expect(scopes).toContain('offline_access');
    expect(scopes).toContain('Files.ReadWrite.All');
    expect(scopes).toContain('Sites.ReadWrite.All');
    // Power BI is a separate consent, so it must not be smuggled in here.
    expect(scopes.join(' ')).not.toMatch(/powerbi/i);

    const state = u.searchParams.get('state') ?? '';
    expect(state.length).toBeGreaterThan(30);
    expect(Number(psql(`SELECT count(*) FROM oauth_states WHERE state = '${state}'`))).toBe(1);
  });

  it('asks for Power BI only when Power BI is what was asked for', async () => {
    const r = await send('/api/v1/microsoft/connect', 'POST', { resource: 'powerbi' }, fatima);
    const scopes = new URL(r.body.url).searchParams.get('scope') ?? '';
    expect(scopes).toMatch(/powerbi\/api\/Report\.Read\.All/);
    expect(scopes).toContain('offline_access');
  });
});

describe('finishing the handshake', () => {
  it('turns a cancelled consent screen into a message, not an error page', async () => {
    const r = await callback({ error: 'access_denied', error_description: 'The user declined' });
    expect(r.status).toBe(303);
    expect(r.message).toMatch(/Microsoft authorization was cancelled or denied/i);
    // Untrusted identity-provider descriptions must never reach the browser.
    expect(r.message).not.toContain('The user declined');
  });

  it('refuses a state it never issued', async () => {
    const r = await callback({ code: 'pretend-code', state: 'not-a-state-we-made' });
    expect(r.status).toBe(303);
    expect(r.message).toMatch(/Microsoft connection could not be completed/i);
    expect(Number(psql(
      `SELECT count(*) FROM integration_connections WHERE provider = 'microsoft'`))).toBe(0);
  });

  it('refuses a state that has expired', async () => {
    const r = await send('/api/v1/microsoft/connect', 'POST', { resource: 'graph' }, fatima);
    const state = new URL(r.body.url).searchParams.get('state')!;
    psql(`UPDATE oauth_states SET expires_at = now() - interval '1 minute' WHERE state = '${state}'`);

    const cb = await callback({ code: 'pretend-code', state });
    expect(cb.message).toMatch(/Microsoft connection could not be completed/i);
  });

  it('will not accept the same state twice', async () => {
    const r = await send('/api/v1/microsoft/connect', 'POST', { resource: 'graph' }, fatima);
    const state = new URL(r.body.url).searchParams.get('state')!;

    // The first use fails at Microsoft, because the code is invented — but it
    // must still consume the state, or a captured callback URL stays live.
    const first = await callback({ code: 'pretend-code', state });
    // The public callback deliberately uses a generic, non-leaking failure message.
    // The consumed state below, not an exposed provider error, proves replay safety.
    expect(first.message).toMatch(/Microsoft connection could not be completed/i);
    expect(first.message).not.toContain('pretend-code');
    expect(Number(psql(`SELECT count(*) FROM oauth_states WHERE state = '${state}'`))).toBe(0);

    const second = await callback({ code: 'pretend-code', state });
    expect(second.message).toMatch(/Microsoft connection could not be completed/i);
  });
});

describe('before anything is connected', () => {
  it('says so, rather than failing, on every route that needs a connection', async () => {
    for (const path of ['/api/v1/microsoft/places', '/api/v1/microsoft/files',
                        '/api/v1/microsoft/reports']) {
      const r = await get(path, fatima);
      // Power BI report enumeration is intentionally fail-closed until
      // per-user Microsoft authorization is implemented. Do not enable
      // legacy workspace-wide delegated bearer-token access for CI.
      if (path === '/api/v1/microsoft/reports') {
        expect(r.status).toBe(503);
        // Production exception filters deliberately sanitize internal error details.
        // The fail-closed 503 is the public contract, not its internal reason.
        expect(String(r.body?.message ?? '')).not.toMatch(/accessToken|refreshToken|clientSecret/i);
      } else {
        expect(r.status, `${path} should refuse politely`).toBe(409);
        expect(String(r.body?.message)).toMatch(/not connected/i);
      }
    }
  });

  it('has nothing to disconnect', async () => {
    const r = await send('/api/v1/microsoft/connection', 'DELETE', undefined, fatima);
    expect(r.status).toBe(404);
    expect(String(r.body?.message)).toMatch(/not connected/i);
  });

  it('reports the server as configured without saying anything secret', async () => {
    const r = await get('/api/v1/microsoft/status', fatima);
    expect(r.body).toEqual({ configured: true, connection: null });
  });
});

describe('the connection row', () => {
  it('is invisible to another workspace, because the database says so', async () => {
    // Written directly, because reaching a connected state needs Microsoft.
    // What is being checked is the tenant boundary, not the handshake.
    const nakheel = psql(`SELECT id FROM tenants WHERE slug = 'al-nakheel'`);
    psql(`INSERT INTO integration_connections (tenant_id, provider, status, account_email)
          VALUES ('${nakheel}', 'microsoft', 'connected', 'someone@al-nakheel.example')`);

    const theirs = await get('/api/v1/microsoft/status', fatima);
    expect(theirs.body.connection?.accountEmail).toBe('someone@al-nakheel.example');

    const khalid = (await login('khalid@nexa.test')).token!;
    const other = await get('/api/v1/microsoft/status', khalid);
    expect(other.body.connection).toBeNull();

    psql(`DELETE FROM integration_connections WHERE provider = 'microsoft'`);
  });
});

describe('workspace delegated Microsoft token boundary', () => {
  it('refuses report enumeration and embed-token access to non-admin EPMO members', async () => {
    const reports = await get('/api/v1/microsoft/reports', viewer);
    const embed = await get('/api/v1/microsoft/reports/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/embed', viewer);
    expect(reports.status).toBe(403);
    expect(embed.status).toBe(403);
    expect(JSON.stringify(embed.body)).not.toContain('accessToken');
  });

  it('does not expose the connected Microsoft account or provider errors in non-admin status', async () => {
    const tenant = psql("SELECT id FROM tenants WHERE slug = 'al-nakheel'");
    psql(`DELETE FROM integration_connections WHERE provider = 'microsoft'`);
    psql(`INSERT INTO integration_connections (tenant_id, provider, status, account_email, account_name, scopes, last_error)
          VALUES ('${tenant}', 'microsoft', 'connected', 'private-admin@al-nakheel.test',
                  'Private Administrator', 'Report.Read.All', 'do not expose provider diagnostics')`);
    try {
      const customer = await get('/api/v1/microsoft/status', viewer);
      const administrator = await get('/api/v1/microsoft/status', fatima);
      expect(customer.status).toBe(200);
      expect(administrator.status).toBe(200);
      expect(customer.body.connection?.status).toBe('connected');
      expect(customer.body.connection?.accountEmail).toBeNull();
      expect(customer.body.connection?.scopes).toBeNull();
      expect(customer.body.connection?.lastError).toBeNull();
      expect(administrator.body.connection?.accountEmail).toBe('private-admin@al-nakheel.test');
    } finally {
      psql(`DELETE FROM integration_connections WHERE provider = 'microsoft'`);
    }
  });
});

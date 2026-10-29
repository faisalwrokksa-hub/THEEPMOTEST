import { describe, it, expect, beforeAll } from 'vitest';
import { API, login, get, reseed } from './helpers';

describe('authentication', () => {
  beforeAll(() => reseed());
  it('refuses an unauthenticated API call', async () => {
    const { status } = await get('/api/v1/projects');
    expect(status).toBe(401);
  });

  it('signs in with correct credentials and returns the workspaces', async () => {
    const { res, token } = await login('fatima@al-nakheel.test');
    expect(res.status).toBe(200);
    expect(token).toBeTruthy();
    const body = await res.json();
    expect(body.tenants.map((t: any) => t.name)).toContain('Al-Nakheel Development');
  });

  it('sets the session cookie httpOnly so scripts cannot read it', async () => {
    const { res } = await login('fatima@al-nakheel.test');
    const c = (res.headers.getSetCookie?.() ?? []).find((x) => x.startsWith('pmo_session='))!;
    expect(c.toLowerCase()).toContain('httponly');
    expect(c.toLowerCase()).toContain('samesite=lax');
  });

  it('gives the same answer for a wrong password and an unknown account', async () => {
    const a = await login('fatima@al-nakheel.test', 'definitely-wrong');
    const b = await login('nobody@nowhere.test', 'definitely-wrong');
    expect(a.res.status).toBe(401);
    expect(b.res.status).toBe(401);
    const [ja, jb] = [await a.res.json(), await b.res.json()];
    // Identical wording: the response must not reveal which emails exist.
    expect(ja.message).toBe(jb.message);
  });

  it('rejects a request with no identifier at all', async () => {
    const res = await fetch(`${API}/auth/login`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: 'x' }),
    });
    expect(res.status).toBe(400);
  });

  it('accepts either a username or an email for the same account', async () => {
    const byName = await login('pmo_consultant');
    const byMail = await login('pm@pmoalign.test');
    expect(byName.res.status).toBe(200);
    expect(byMail.res.status).toBe(200);
    expect(byName.token).toBeTruthy();
    expect(byMail.token).toBeTruthy();
  });

  it('lists both workspaces for an account that belongs to two', async () => {
    const { res } = await login('pmo_consultant');
    const body = await res.json();
    expect(body.tenants.length).toBe(2);
  });

  it('revokes the session on logout', async () => {
    const { token } = await login('fatima@al-nakheel.test');
    expect((await get('/api/v1/projects', token)).status).toBe(200);
    await fetch(`${API}/auth/logout`, { method: 'POST', headers: { cookie: `pmo_session=${token}` } });
    expect((await get('/api/v1/projects', token)).status).toBe(401);
  });

  it('rejects a cross-site browser mutation before it reaches authentication', async () => {
    const res = await fetch(`${API}/auth/logout`, {
      method: 'POST',
      headers: { origin: 'https://attacker.invalid', 'sec-fetch-site': 'cross-site' },
    });
    expect(res.status).toBe(403);
  });

  it('rejects an unapproved Origin even without Fetch Metadata', async () => {
    const res = await fetch(`${API}/auth/logout`, {
      method: 'POST', headers: { origin: 'https://attacker.invalid' },
    });
    expect(res.status).toBe(403);
  });

  it('permits internal logout calls without browser provenance headers', async () => {
    const { token } = await login('fatima@al-nakheel.test');
    const res = await fetch(`${API}/auth/logout`, {
      method: 'POST', headers: { cookie: `pmo_session=${token}` },
    });
    expect(res.status).toBe(200);
    expect((await get('/api/v1/projects', token)).status).toBe(401);
  });

  it('revokes all of an account’s sessions without affecting another account', async () => {
    const first = await login('fatima@al-nakheel.test');
    const second = await login('fatima@al-nakheel.test');
    const other = await login('pm@pmoalign.test');
    expect(first.token).toBeTruthy();
    expect(second.token).toBeTruthy();
    expect(other.token).toBeTruthy();
    const res = await fetch(`${API}/auth/logout-all`, {
      method: 'POST', headers: { cookie: `pmo_session=${first.token}` },
    });
    expect(res.status).toBe(200);
    expect((await res.json()).revokedSessions).toBeGreaterThanOrEqual(2);
    expect((await get('/api/v1/projects', first.token)).status).toBe(401);
    expect((await get('/api/v1/projects', second.token)).status).toBe(401);
    expect((await get('/api/v1/projects', other.token)).status).toBe(200);
  });

  it('refuses unauthenticated account-wide session revocation', async () => {
    const res = await fetch(`${API}/auth/logout-all`, { method: 'POST' });
    expect(res.status).toBe(401);
  });

  it('rejects cross-site account-wide sign-out', async () => {
    const res = await fetch(`${API}/auth/logout-all`, {
      method: 'POST', headers: {
        origin: 'https://attacker.invalid', 'sec-fetch-site': 'cross-site',
      },
    });
    expect(res.status).toBe(403);
  });

  it('rejects a forged session token', async () => {
    const { status } = await get('/api/v1/projects', 'a'.repeat(43));
    expect(status).toBe(401);
  });
});

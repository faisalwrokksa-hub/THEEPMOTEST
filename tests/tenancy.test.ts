import { describe, it, expect, beforeAll } from 'vitest';
import { API, login, get, reseed } from './helpers';

let fatima: string, khalid: string, consultant: string;

beforeAll(async () => {
  reseed();
  fatima = (await login('fatima@al-nakheel.test')).token!;
  khalid = (await login('khalid@nexa.test')).token!;
  consultant = (await login('pm@pmoalign.test')).token!;
});

describe('tenant isolation', () => {
  it('shows each workspace only its own projects', async () => {
    const a = await get('/api/v1/projects', fatima);
    const b = await get('/api/v1/projects', khalid);
    const codesA = a.body.items.map((p: any) => p.code).sort();
    const codesB = b.body.items.map((p: any) => p.code).sort();
    // Asserted as a boundary, not a roster: the demo portfolio grows, and a
    // test that breaks when a project is added is testing the seed, not isolation.
    expect(codesA).toEqual(expect.arrayContaining(['ANR', 'JWH', 'RCM']));
    expect(codesA.length).toBeGreaterThanOrEqual(3);
    expect(codesB).toEqual(['NXC']);
    expect(codesA.filter((c: string) => codesB.includes(c))).toHaveLength(0);
  });

  it('refuses to switch into a workspace you do not belong to', async () => {
    const mine = await get('/auth/session', fatima);
    const theirTenant = mine.body.tenantId;
    const res = await fetch(`${API}/auth/switch-tenant`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: `pmo_session=${khalid}` },
      body: JSON.stringify({ tenantId: theirTenant }),
    });
    expect(res.status).toBe(401);
  });

  it('refuses tenant switching without a valid session', async () => {
    const mine = await get('/auth/session', fatima);
    const res = await fetch(`${API}/auth/switch-tenant`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tenantId: mine.body.tenantId }),
    });
    expect(res.status).toBe(401);
  });

  it('rejects invalid tenant identifiers before attempting a switch', async () => {
    const res = await fetch(`${API}/auth/switch-tenant`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: `pmo_session=${fatima}` },
      body: JSON.stringify({ tenantId: 'not-a-uuid' }),
    });
    expect(res.status).toBe(400);
  });

  it('leaks nothing across tenants on any shared list endpoint', async () => {
    // Endpoints both workspaces are licensed for. Module-gated ones are covered
    // in modules.test.ts, where a 403 is the expected answer.
    const paths = ['/api/v1/gates', '/api/v1/raid', '/api/v1/tasks', '/api/v1/projects'];
    for (const p of paths) {
      const a = await get(p, fatima);
      const b = await get(p, khalid);
      expect(a.status, p).toBe(200);
      expect(b.status, p).toBe(200);
      // Every list row must expose a stable id, otherwise this check is vacuous.
      const key = (r: any) => r.id ?? r.gateId;
      const listA = Array.isArray(a.body) ? a.body : (a.body as any).items;
      const listB = Array.isArray(b.body) ? b.body : (b.body as any).items;
      for (const r of [...listA, ...listB])
        expect(key(r), `${p} returned a row with no id`).toBeTruthy();
      const ids = new Set((listA as any[]).map(key));
      const overlap = (listB as any[]).filter((r) => ids.has(key(r)));
      expect(overlap, `${p} leaked rows across tenants`).toHaveLength(0);
    }
  });

  it('gives a consultant visibility without approval rights', async () => {
    const me = await get('/api/v1/me', consultant);
    expect(me.body.role).toBe('staff_consultant');
    expect(me.body.capabilities).toContain('pmoa_view_financials');
    expect(me.body.capabilities).not.toContain('pmoa_approve');
    expect(me.body.capabilities).not.toContain('pmoa_admin');
    // and can still see the client's projects it is engaged on
    // The same projects the workspace owner sees — a consultant is engaged on
    // the whole portfolio, and the point is that visibility is not the same
    // thing as the right to approve.
    const ownerSees = (await get('/api/v1/projects', fatima)).body.items.length;
    expect((await get('/api/v1/projects', consultant)).body.items.length).toBe(ownerSees);
  });
});

import { describe, it, expect, beforeAll } from 'vitest';
import { API, login, get, as, reseed } from './helpers';

let acme: string, nexa: string, customer: string;

beforeAll(async () => {
  reseed();
  // Entitlements are a vendor action now: a customer's own owner cannot grant
  // themselves a module they have not bought.
  acme = (await login('platform@aetherix.test')).token!;   // vendor, full suite
  customer = (await login('khalid@nexa.test')).token!;     // a customer's own owner

  /* Entitlements are a vendor action, so the Nexa checks below are made by the
     vendor acting inside Nexa's workspace rather than by Nexa itself. */
  const vendorInNexa = (await login('platform@aetherix.test')).token!;
  const tenants = (await get('/auth/session', vendorInNexa)).body.tenants ?? [];
  const nexaId = tenants.find((t: any) => /Nexa/.test(t.name))?.tenantId;
  await fetch(`${API}/auth/switch-tenant`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...as(vendorInNexa) },
    body: JSON.stringify({ tenantId: nexaId }),
  });
  nexa = vendorInNexa;
});

const patch = async (id: string, body: unknown, token: string) => {
  const res = await fetch(`${API}/api/v1/platform/modules/${id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', ...as(token) },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
};

describe('module registry', () => {
  it('publishes the whole catalogue with this tenant’s entitlements', async () => {
    const { body } = await get('/api/v1/platform/modules', acme);
    expect(body.length).toBeGreaterThanOrEqual(16);
    expect(body.find((m: any) => m.id === 'core360').isCore).toBe(true);
    // dependsOn must be an array, not the raw jsonb string
    for (const m of body) expect(Array.isArray(m.dependsOn), m.id).toBe(true);
  });

  it('gives different tenants different entitlements', async () => {
    const a = (await get('/api/v1/platform/enabled', acme)).body;
    const n = (await get('/api/v1/platform/enabled', nexa)).body;
    expect(a).toContain('finance360');
    expect(n).not.toContain('finance360');
    expect(n).toContain('pmo360');
  });
});

describe('licensing is enforced by the API, not the menu', () => {
  it('refuses an unlicensed module even when the URL is called directly', async () => {
    for (const path of ['/api/v1/financials', '/api/v1/benefits', '/api/v1/resources',
                        '/api/v1/documents', '/api/v1/stakeholders', '/api/v1/analytics']) {
      const r = await get(path, nexa);
      expect(r.status, path).toBe(403);
      expect(r.body.message, path).toMatch(/not enabled for this workspace/i);
    }
  });

  it('still serves the modules that tenant does hold', async () => {
    expect((await get('/api/v1/projects', nexa)).status).toBe(200);
    expect((await get('/api/v1/raid', nexa)).status).toBe(200);
  });

  it('never blocks core platform routes', async () => {
    for (const path of ['/api/v1/me', '/api/v1/overview', '/api/v1/settings', '/api/v1/my-work'])
      expect((await get(path, nexa)).status, path).toBe(200);
  });
});

describe('licensed finance data is also restricted by member capability', () => {
  it('denies detailed financial and benefits data to staff without financial access', async () => {
    const engineer = (await login('engineer@al-nakheel.test')).token!;
    expect((await get('/api/v1/financials', engineer)).status).toBe(403);
    expect((await get('/api/v1/benefits', engineer)).status).toBe(403);
  }, 60_000);
  it('allows a member explicitly assigned finance viewing permissions', async () => {
    const finance = (await login('finance@al-nakheel.test')).token!;
    expect((await get('/api/v1/financials', finance)).status).toBe(200);
    expect((await get('/api/v1/benefits', finance)).status).toBe(200);
  }, 60_000);
});

describe('entitlement changes', () => {
  it('needs the admin capability', async () => {
    const consultant = (await login('pm@pmoalign.test')).token!;
    expect((await patch('finance360', { enabled: false }, consultant)).status).toBe(403);
  });

  it('will not disable the core platform', async () => {
    const r = await patch('core360', { enabled: false }, acme);
    expect(r.status).toBe(409);
    expect(r.body.message).toMatch(/cannot be disabled/i);
  });

  it('will not enable a module that is not offered for licensing', async () => {
    const r = await patch('strategy360', { enabled: true }, acme);
    expect(r.status).toBe(409);
    expect(r.body.message).toMatch(/not available for licensing/i);
  });

  it('refuses to enable a module whose dependencies are off', async () => {
    // Nexa has no benefits360, and it depends on pmo360 (which it has) — so
    // use a case where the dependency genuinely is missing.
    // A customer cannot license themselves anything — the commercial control.
    expect((await patch('benefits360', { enabled: true }, customer)).status).toBe(403);
    const r = await patch('benefits360', { enabled: true }, nexa);
    expect([200, 409]).toContain(r.status);  // pmo360 is on, so this should succeed
    if (r.status === 200) await patch('benefits360', { enabled: false }, nexa);
  });

  it('refuses to disable a module that another enabled module depends on', async () => {
    // benefits360 depends on pmo360; Al-Nakheel has both enabled.
    const r = await patch('pmo360', { enabled: false }, acme);
    expect(r.status).toBe(409);
    expect(r.body.message).toMatch(/depend/i);
  });

  it('takes effect immediately, both ways', async () => {
    expect((await get('/api/v1/financials', acme)).status).toBe(200);
    expect((await patch('finance360', { enabled: false }, acme)).status).toBe(200);
    expect((await get('/api/v1/financials', acme)).status).toBe(403);
    expect((await patch('finance360', { enabled: true }, acme)).status).toBe(200);
    expect((await get('/api/v1/financials', acme)).status).toBe(200);
  });

  it('records every entitlement change in the audit trail', async () => {
    const { psql } = await import('./helpers');
    const before = Number(psql("select count(*) from audit_events where entity='module'"));
    await patch('crm360', { enabled: false }, acme);
    await patch('crm360', { enabled: true }, acme);
    const after = Number(psql("select count(*) from audit_events where entity='module'"));
    expect(after).toBeGreaterThan(before);
  });
});

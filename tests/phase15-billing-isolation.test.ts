/**
 * Phase 15A: REAL running-API/PostgreSQL acceptance coverage.
 * Executed by the CI integration job, not by dependency-free `test:offline`.
 * The fixture deliberately creates invoices for TWO independent organizations;
 * a test against an empty database cannot pass by accident.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { API, get, login, psql, reseed } from './helpers';
import { assertDisposableAcceptanceConfig } from '../scripts/phase15c-acceptance-safety.mjs';
import { assertTenantPage, assertProjectDetail, assertDeniedForeignRecord, assertActiveTenant, assertTenantInvoiceList } from '../scripts/phase16e-tenant-assertions.mjs';

const PLAN_CODE = 'phase15_billing_isolation_ci';
// Never mutate a database during an ordinary local `pnpm test` run.
// CI explicitly opts in when the running API and seeded test database exist.
const liveAcceptance = process.env.PHASE15_BILLING_ACCEPTANCE === 'true';
let ownerA: string;
let ownerB: string;
let consultant: string;
let invoiceA: string;
let invoiceB: string;
let tenantA: string;
let tenantB: string;
let projectA: string;
let projectB: string;

beforeAll(async () => {
  if (!liveAcceptance) return;
  // Refuse reseeding unless explicitly approved against a local, disposable test DB.
  assertDisposableAcceptanceConfig(process.env);
  // CI-only demo identities; reset between integration test files.
  reseed();
  // The test invoice amounts are test fixtures, NOT externally settled payments.
  // Use an admin connection to seed; the application itself must use pmo_app/RLS.
  const fixture = psql(`
    INSERT INTO subscription_plans(code, name, price_minor, currency, billing_interval, trial_days)
    VALUES ('${PLAN_CODE}', 'Phase 15 CI tenant-isolation fixture', 12900, 'SAR', 'monthly', 0)
    ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name;
    INSERT INTO tenant_subscriptions(tenant_id, plan_id, status, period_starts_at, period_ends_at)
    SELECT t.id, p.id, 'active', now() - interval '1 day', now() + interval '31 days'
    FROM tenants t CROSS JOIN subscription_plans p
    WHERE t.slug IN ('al-nakheel', 'nexa') AND p.code = '${PLAN_CODE}';
    INSERT INTO billing_invoices(tenant_id, subscription_id, period_starts_at, period_ends_at, amount_minor, currency)
    SELECT s.tenant_id, s.id, s.period_ends_at, s.period_ends_at + interval '30 days', 12900, 'SAR'
    FROM tenant_subscriptions s JOIN subscription_plans p ON p.id=s.plan_id
    WHERE p.code='${PLAN_CODE}';
    SELECT t.slug || '|' || t.id || '|' || i.id
    FROM billing_invoices i JOIN tenants t ON t.id = i.tenant_id
    JOIN tenant_subscriptions s ON s.id=i.subscription_id
    JOIN subscription_plans p ON p.id=s.plan_id
    WHERE p.code='${PLAN_CODE}' ORDER BY t.slug;
  `);
  const entries = fixture.split(/\r?\n/).filter(line => /^(al-nakheel|nexa)\|/.test(line));
  expect(entries).toHaveLength(2);
  const a = entries[0].split('|');
  const b = entries[1].split('|');
  expect(a[0]).toBe('al-nakheel');
  expect(b[0]).toBe('nexa');
  [, tenantA, invoiceA] = a;
  [, tenantB, invoiceB] = b;
  expect(tenantA).not.toBe(tenantB);
  expect(invoiceA).not.toBe(invoiceB);

  // Projects already exist in the two-tenant demo seed. Look them up using an
  // administrator connection, then prove their isolation through the HTTP API.
  const seededProjects = psql(`
    SELECT t.slug || '|' || p.id
    FROM projects p JOIN tenants t ON p.tenant_id = t.id
    WHERE t.slug IN ('al-nakheel', 'nexa')
    ORDER BY t.slug, p.code;
  `).split(/\r?\n/).filter(line => /^(al-nakheel|nexa)\|/.test(line));
  const projectFor = (slug: string) => seededProjects.find(line => line.startsWith(`${slug}|`))?.split('|')[1];
  projectA = projectFor('al-nakheel')!;
  projectB = projectFor('nexa')!;
  expect(projectA).toMatch(/^[a-f0-9-]{36}$/i);
  expect(projectB).toMatch(/^[a-f0-9-]{36}$/i);
  expect(projectA).not.toBe(projectB);

  const [aLogin, bLogin, consultantLogin] = await Promise.all([
    login('fatima@al-nakheel.test'), login('khalid@nexa.test'), login('pm@pmoalign.test'),
  ]);
  expect(aLogin.res.status).toBe(200);
  expect(bLogin.res.status).toBe(200);
  expect(consultantLogin.res.status).toBe(200);
  ownerA = aLogin.token!;
  ownerB = bLogin.token!;
  consultant = consultantLogin.token!;
});

describe.skipIf(!liveAcceptance)('Phase 15A: real billing API tenant isolation', () => {
  it('requires a signed-in session for financial records', async () => {
    for (const route of ['invoices', 'payments', 'reconciliation']) {
      expect((await get(`/api/v1/subscription/billing/${route}`)).status).toBe(401);
    }
  });

  it('permits workspace administrators but denies non-admin consultants', async () => {
    expect((await get('/api/v1/subscription/billing/invoices', ownerA)).status).toBe(200);
    expect((await get('/api/v1/subscription/billing/invoices', ownerB)).status).toBe(200);
    expect((await get('/api/v1/subscription/billing/invoices', consultant)).status).toBe(403);
  });

  it('returns nonempty invoices only to the correct tenant', async () => {
    const left = await get('/api/v1/subscription/billing/invoices', ownerA);
    const right = await get('/api/v1/subscription/billing/invoices', ownerB);
    expect(left.status).toBe(200);
    expect(right.status).toBe(200);
    expect(Array.isArray(left.body)).toBe(true);
    expect(Array.isArray(right.body)).toBe(true);
    expect(left.body.some((i: any) => i.id === invoiceA)).toBe(true);
    expect(right.body.some((i: any) => i.id === invoiceB)).toBe(true);
    for (const row of left.body) expect(row.tenantId).toBe(tenantA);
    for (const row of right.body) expect(row.tenantId).toBe(tenantB);
    expect(left.body.some((i: any) => i.id === invoiceB)).toBe(false);
    expect(right.body.some((i: any) => i.id === invoiceA)).toBe(false);
  });

  it('returns only the current plan for the signed-in tenant', async () => {
    for (const token of [ownerA, ownerB]) {
      const result = await get('/api/v1/subscription/current', token);
      expect(result.status).toBe(200);
      expect(result.body.planCode).toBe(PLAN_CODE);
      expect(result.body.status).toBe('active');
    }
  });

  it('canceling tenant A does not change tenant B; resuming restores A', async () => {
    const post = (path: string, token: string) => fetch(`${API}${path}`, {
      method: 'POST', headers: { cookie: `pmo_session=${token}` },
    });
    const cancel = await post('/api/v1/subscription/cancel-at-period-end', ownerA);
    expect(cancel.status).toBe(201);
    expect((await cancel.json()).cancelAtPeriodEnd).toBe(true);
    expect((await get('/api/v1/subscription/current', ownerA)).body.cancelAtPeriodEnd).toBe(true);
    expect((await get('/api/v1/subscription/current', ownerB)).body.cancelAtPeriodEnd).toBe(false);
    // A repeated cancellation must not create a second preference change.
    const repeated = await post('/api/v1/subscription/cancel-at-period-end', ownerA);
    expect(repeated.status).toBe(201);
    expect((await repeated.json()).unchanged).toBe(true);
    const resume = await post('/api/v1/subscription/resume', ownerA);
    expect(resume.status).toBe(201);
    expect((await get('/api/v1/subscription/current', ownerA)).body.cancelAtPeriodEnd).toBe(false);
    expect((await get('/api/v1/subscription/current', ownerB)).body.cancelAtPeriodEnd).toBe(false);
  });

  it('refuses billing mutation from an unprivileged user and unsigned webhook', async () => {
    const response = await fetch(`${API}/api/v1/subscription/billing/renewal-invoice`, {
      method: 'POST', headers: { cookie: `pmo_session=${consultant}` },
    });
    expect(response.status).toBe(403);
    const webhook = await fetch(`${API}/api/v1/billing/stripe-webhook`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
    });
    // Stripe is intentionally disabled in CI; no unverified request may settle payment.
    expect([400, 403, 503]).toContain(webhook.status);
  });
});


/**
 * Phase 16E: authenticated project AND billing acceptance against two real
 * seeded tenants. Shares the one destructive CI fixture with Phase 15A so a
 * second reseed cannot silently invalidate earlier session/project IDs.
 */
describe.skipIf(!liveAcceptance)('Phase 16E: authenticated tenant isolation and workspace switching', () => {
  const switchTo = (token: string, tenantId: string) => fetch(`${API}/auth/switch-tenant`, {
    method: 'POST',
    headers: { cookie: `pmo_session=${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ tenantId }),
  });

  it('returns nonempty projects only for the authenticated owner tenant', async () => {
    const [left, right] = await Promise.all([
      get('/api/v1/projects?limit=100', ownerA),
      get('/api/v1/projects?limit=100', ownerB),
    ]);
    expect(left.status).toBe(200);
    expect(right.status).toBe(200);
    expect(assertTenantPage(left.body, tenantA, tenantB, projectA)).toBe(true);
    expect(assertTenantPage(right.body, tenantB, tenantA, projectB)).toBe(true);
  });

  it('cannot retrieve a foreign project by guessing its UUID', async () => {
    const [ownA, ownB, foreignA, foreignB] = await Promise.all([
      get(`/api/v1/projects/${projectA}`, ownerA),
      get(`/api/v1/projects/${projectB}`, ownerB),
      get(`/api/v1/projects/${projectB}`, ownerA),
      get(`/api/v1/projects/${projectA}`, ownerB),
    ]);
    expect(ownA.status).toBe(200);
    expect(ownB.status).toBe(200);
    expect(assertProjectDetail(ownA.body, tenantA, projectA)).toBe(true);
    expect(assertProjectDetail(ownB.body, tenantB, projectB)).toBe(true);
    expect(assertDeniedForeignRecord(foreignA, 'owner A foreign project')).toBe(true);
    expect(assertDeniedForeignRecord(foreignB, 'owner B foreign project')).toBe(true);
  });

  it('does not trust a forged tenant header accompanying a valid owner cookie', async () => {
    const response = await fetch(`${API}/api/v1/projects/${projectB}`, {
      headers: {
        cookie: `pmo_session=${ownerA}`,
        'x-tenant-id': tenantB,
        'x-user-id': 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
      },
    });
    expect(assertDeniedForeignRecord({ status: response.status }, 'forged tenant header')).toBe(true);
    expect(assertActiveTenant((await get('/auth/session', ownerA)).body, tenantA)).toBe(true);
  });

  it('rejects a workspace switch by an owner without membership', async () => {
    const response = await switchTo(ownerA, tenantB);
    expect(response.status).toBe(401);
    expect(assertActiveTenant((await get('/auth/session', ownerA)).body, tenantA)).toBe(true);
    expect((await get('/api/v1/projects/' + projectA, ownerA)).status).toBe(200);
  });

  it('keeps the shared consultant in the selected tenant, never merges rows', async () => {
    const selectA = await switchTo(consultant, tenantA);
    expect(selectA.status).toBe(200);
    expect(assertActiveTenant((await get('/auth/session', consultant)).body, tenantA)).toBe(true);
    const projectsA = await get('/api/v1/projects?limit=100', consultant);
    expect(projectsA.status).toBe(200);
    expect(assertTenantPage(projectsA.body, tenantA, tenantB, projectA)).toBe(true);
    expect(assertDeniedForeignRecord(await get(`/api/v1/projects/${projectB}`, consultant), 'consultant tenant A')).toBe(true);

    const selectB = await switchTo(consultant, tenantB);
    expect(selectB.status).toBe(200);
    expect(assertActiveTenant((await get('/auth/session', consultant)).body, tenantB)).toBe(true);
    const projectsB = await get('/api/v1/projects?limit=100', consultant);
    expect(projectsB.status).toBe(200);
    expect(assertTenantPage(projectsB.body, tenantB, tenantA, projectB)).toBe(true);
    expect(assertDeniedForeignRecord(await get(`/api/v1/projects/${projectA}`, consultant), 'consultant tenant B')).toBe(true);
    // Restore the fixture session to prevent order-dependent integration tests.
    expect((await switchTo(consultant, tenantA)).status).toBe(200);
  });

  it('does not change another owner session when a shared user switches', async () => {
    expect(assertActiveTenant((await get('/auth/session', ownerA)).body, tenantA)).toBe(true);
    expect(assertActiveTenant((await get('/auth/session', ownerB)).body, tenantB)).toBe(true);
  });

  it('keeps invoice visibility correct after a permitted tenant switch', async () => {
    // The consultant cannot read billing as a tenant admin. Both owners still
    // must see their own seeded invoices after the shared session is switched.
    const left = await get('/api/v1/subscription/billing/invoices', ownerA);
    const right = await get('/api/v1/subscription/billing/invoices', ownerB);
    expect(left.status).toBe(200);
    expect(right.status).toBe(200);
    expect(assertTenantInvoiceList(left.body, tenantA, tenantB, invoiceA)).toBe(true);
    expect(assertTenantInvoiceList(right.body, tenantB, tenantA, invoiceB)).toBe(true);
    expect((await get('/api/v1/subscription/billing/invoices', consultant)).status).toBe(403);
  });
});

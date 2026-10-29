import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { API, login, get, as, reseed, psql } from './helpers';

async function send(path: string, method: string, body: unknown, token: string) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...as(token) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

let fatima: string, khalid: string, viewer: string, projectId: string;

beforeAll(() => {
  // These tests mutate gate state, so start from a known seed.
  reseed();
});

beforeEach(async () => {
  fatima = (await login('fatima@al-nakheel.test'))!.token!;
  khalid = (await login('khalid@nexa.test'))!.token!;
  viewer = (await login('pm@pmoalign.test'))!.token!;   // staff_consultant: no approve
  projectId = psql("select id from projects where code='ANR'");
});

const governance = async (t: string) =>
  (await get(`/api/v1/projects/${projectId}/governance`, t)).body;

describe('gate writes', () => {
  it('will not mark a criterion met without evidence', async () => {
    const g = await governance(fatima);
    const active = g.gates.find((x: any) => x.status === 'active');
    const unmet = g.criteria.find((c: any) => c.gateId === active.id && !c.isMet);
    const r = await send(`/api/v1/gate-criteria/${unmet.id}`, 'PATCH', { isMet: true }, fatima);
    expect(r.status).toBe(409);
    expect(r.body.message).toMatch(/evidence/i);
  });

  it('records who met a criterion and when', async () => {
    const g = await governance(fatima);
    const active = g.gates.find((x: any) => x.status === 'active');
    const unmet = g.criteria.find((c: any) => c.gateId === active.id && !c.isMet);
    const r = await send(`/api/v1/gate-criteria/${unmet.id}`, 'PATCH',
      { isMet: true, evidenceUrl: 'https://docs.example/proof.pdf' }, fatima);
    expect(r.status).toBe(200);
    const after = await governance(fatima);
    const row = after.criteria.find((c: any) => c.id === unmet.id);
    expect(row.isMet).toBe(true);
    expect(row.metBy).toBe('Fatima Al-Zahrani');
    expect(row.metAt).toBeTruthy();
  });

  it('refuses a signature from anyone but the assigned approver', async () => {
    const g = await governance(fatima);
    const active = g.gates.find((x: any) => x.status === 'active');
    const pending = g.approvals.find((a: any) => a.gateId === active.id && a.decision === 'pending');
    // A different tenant cannot even see the row.
    expect((await send(`/api/v1/approvals/${pending.id}/decision`, 'POST',
      { decision: 'approved' }, khalid)).status).toBe(404);
  });

  it('denies the whole write path to a role without the capability', async () => {
    const g = await governance(viewer);
    const active = g.gates.find((x: any) => x.status === 'active');
    const pending = g.approvals.find((a: any) => a.gateId === active.id && a.decision === 'pending');
    const r = await send(`/api/v1/approvals/${pending.id}/decision`, 'POST',
      { decision: 'approved' }, viewer);
    expect(r.status).toBe(403);
    expect(r.body.message).toMatch(/pmoa_approve/);
    // …and cannot force the gate either
    expect((await send(`/api/v1/gates/${active.id}/advance`, 'POST', undefined, viewer)).status).toBe(403);
  });

  it('refuses to advance a gate and names every reason', async () => {
    const g = await governance(fatima);
    const active = g.gates.find((x: any) => x.status === 'active');
    const r = await send(`/api/v1/gates/${active.id}/advance`, 'POST', undefined, fatima);
    expect(r.status).toBe(409);
    const kinds = r.body.blockers.map((b: any) => b.kind);
    expect(kinds).toContain('criteria');
    expect(kinds).toContain('approval');
    expect(kinds).toContain('register');
  });

  it('passes the gate once every condition is genuinely met, and opens the next', async () => {
    const g = await governance(fatima);
    const active = g.gates.find((x: any) => x.status === 'active');

    for (const c of g.criteria.filter((c: any) => c.gateId === active.id && !c.isMet))
      await send(`/api/v1/gate-criteria/${c.id}`, 'PATCH',
        { isMet: true, evidenceUrl: 'https://docs.example/e.pdf' }, fatima);
    for (const a of g.approvals.filter((a: any) => a.gateId === active.id && a.decision === 'pending'))
      await send(`/api/v1/approvals/${a.id}/decision`, 'POST', { decision: 'approved' }, fatima);
    for (const b of g.blockers.filter((b: any) => b.gateId === active.id && b.status !== 'closed'))
      await send(`/api/v1/raid/${b.id}`, 'PATCH', { status: 'closed' }, fatima);

    const readiness = await get(`/api/v1/gates/${active.id}/readiness`, fatima);
    expect(readiness.body.mayPass).toBe(true);

    const r = await send(`/api/v1/gates/${active.id}/advance`, 'POST', undefined, fatima);
    expect(r.status).toBe(200);
    expect(r.body.passed).toContain(active.name);
    expect(r.body.nowActive).toBeTruthy();

    // A gate that opens must arrive usable: checklist and an accountable owner.
    expect(r.body.criteriaAwaiting).toBeGreaterThan(0);
    const after = await governance(fatima);
    const next = after.gates.find((x: any) => x.status === 'active');
    const acct = after.approvals.filter((a: any) => a.gateId === next.id && a.isAccountable);
    expect(acct).toHaveLength(1);
  });

  it('allows only one of two simultaneous advances and records one audit event', async () => {
    const g = await governance(fatima);
    const active = g.gates.find((x: any) => x.status === 'active');
    expect(active).toBeTruthy();
    for (const c of g.criteria.filter((x: any) => x.gateId === active.id && !x.isMet)) {
      const result = await send(`/api/v1/gate-criteria/${c.id}`, 'PATCH',
        { isMet: true, evidenceUrl: 'https://docs.example/concurrency.pdf' }, fatima);
      expect(result.status).toBe(200);
    }
    for (const a of g.approvals.filter((x: any) => x.gateId === active.id && x.decision === 'pending')) {
      const result = await send(`/api/v1/approvals/${a.id}/decision`, 'POST',
        { decision: 'approved' }, fatima);
      expect(result.status).toBe(200);
    }
    for (const b of g.blockers.filter((x: any) => x.gateId === active.id && x.status !== 'closed')) {
      const result = await send(`/api/v1/raid/${b.id}`, 'PATCH', { status: 'closed' }, fatima);
      expect(result.status).toBe(200);
    }
    const ready = await get(`/api/v1/gates/${active.id}/readiness`, fatima);
    expect(ready.body.mayPass).toBe(true);
    const prior = Number(psql(`select count(*) from audit_events where entity='gate' and entity_id='${active.id}' and action='gate.approved'`));
    const results = await Promise.all([
      send(`/api/v1/gates/${active.id}/advance`, 'POST', undefined, fatima),
      send(`/api/v1/gates/${active.id}/advance`, 'POST', undefined, fatima),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    const after = Number(psql(`select count(*) from audit_events where entity='gate' and entity_id='${active.id}' and action='gate.approved'`));
    expect(after).toBe(prior + 1);
    const final = await governance(fatima);
    expect(final.gates.filter((x: any) => x.status === 'active')).toHaveLength(1);
  });

  it('cannot pass the same gate twice', async () => {
    const g = await governance(fatima);
    const passed = g.gates.filter((x: any) => x.status === 'approved')[0];
    const r = await send(`/api/v1/gates/${passed.id}/advance`, 'POST', undefined, fatima);
    expect(r.status).toBe(409);
  });

  it('writes an audit row for every change', async () => {
    const before = Number(psql('select count(*) from audit_events'));
    const g = await governance(fatima);
    const active = g.gates.find((x: any) => x.status === 'active');
    const c = g.criteria.find((x: any) => x.gateId === active.id);
    await send(`/api/v1/gate-criteria/${c.id}`, 'PATCH',
      { isMet: !c.isMet, evidenceUrl: 'https://docs.example/audit.pdf' }, fatima);
    const after = Number(psql('select count(*) from audit_events'));
    expect(after).toBeGreaterThan(before);
  });
});

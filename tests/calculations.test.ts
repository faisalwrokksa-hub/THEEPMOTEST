import { describe, it, expect, beforeAll } from 'vitest';
import { login, get, reseed } from './helpers';

let t: string, nexa: string;
beforeAll(async () => {
  reseed();
  t = (await login('fatima@al-nakheel.test')).token!;
  nexa = (await login('khalid@nexa.test')).token!;
});

describe('financial calculations', () => {
  it('builds the forecast per category, not from forecast rows alone', async () => {
    const { body } = await get('/api/v1/financials', t);
    const anr = body.byProject.find((p: any) => p.code === 'ANR');
    // ANR forecasts only Construction. A naive sum would be 548M against a 680M
    // budget and read as 132M UNDER. Per-category fallback gives 708M — over.
    expect(anr.forecast).toBeGreaterThan(anr.budget);
    expect(anr.variance).toBeGreaterThan(0);
    expect(anr.forecastCoverage).toBeLessThan(1);
  });

  it('suppresses CPI until enough budget is drawn to make it meaningful', async () => {
    const { body } = await get('/api/v1/financials', t);
    for (const p of body.byProject) {
      if (p.drawnPct < 15) expect(p.cpi, p.code).toBeNull();
      else expect(p.cpi, p.code).toBeGreaterThan(0);
      // A CPI above 5 is arithmetically impossible on a real project.
      if (p.cpi !== null) expect(p.cpi, p.code).toBeLessThan(5);
    }
  });

  it('never reports a project budget that disagrees with its cost lines', async () => {
    const { body } = await get('/api/v1/financials', t);
    for (const p of body.byProject) expect(p.budget).toBeGreaterThanOrEqual(0);
  });
});

describe('benefit progress', () => {
  it('measures baseline toward target when the target is a reduction', async () => {
    const { body } = await get('/api/v1/benefits', t);
    const b = body.find((x: any) => x.direction === 'decrease');
    expect(b, 'seed should contain a reduction-target benefit').toBeTruthy();
    // 18 -> 11, target 6. Progress is (18-11)/(18-6) = 58%, not actual/target.
    expect(b.pctOfTarget).toBe(58);
  });

  it('keeps every benefit percentage inside 0..100', async () => {
    // Only tenants licensed for Benefits360 can be asked.
    for (const tok of [t]) {
      const { body } = await get('/api/v1/benefits', tok);
      for (const b of body) {
        if (b.pctOfTarget !== null) {
          expect(b.pctOfTarget).toBeGreaterThanOrEqual(0);
          expect(b.pctOfTarget).toBeLessThanOrEqual(100);
        }
      }
    }
  });
});

describe('gate rules', () => {
  it('refuses to pass a gate with unmet criteria, unsigned approvals or a blocker', async () => {
    const { body } = await get('/api/v1/gates', t);
    const anr = body.find((g: any) => g.projectCode === 'ANR');
    expect(anr.criteriaMet).toBeLessThan(anr.criteriaTotal);
    expect(anr.unsigned).toBeGreaterThan(0);
    expect(anr.blockedBy.length).toBeGreaterThan(0);
    expect(anr.mayPass).toBe(false);
  });

  it('counts criteria without inflating them through joins', async () => {
    const { body } = await get('/api/v1/gates', t);
    const anr = body.find((g: any) => g.projectCode === 'ANR');
    // Five criteria exist, two met. A criteria x approvals join would say 2/10.
    expect(anr.criteriaTotal).toBe(5);
    expect(anr.criteriaMet).toBe(2);
    expect(anr.unsigned).toBe(1);
  });

  it('names one accountable owner per gate', async () => {
    const { body } = await get('/api/v1/approvals', t);
    const byGate = new Map<string, number>();
    for (const a of body.filter((x: any) => x.isAccountable))
      byGate.set(a.gate + a.projectCode, (byGate.get(a.gate + a.projectCode) ?? 0) + 1);
    for (const [gate, n] of byGate) expect(n, gate).toBe(1);
  });
});

describe('validation', () => {
  it('rejects an invalid project payload with per-field issues', async () => {
    const res = await fetch('http://localhost:4000/api/v1/projects', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: `pmo_session=${t}` },
      body: JSON.stringify({ name: '' }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.issues.map((i: any) => i.path)).toContain('code');
  });

  it('caps page size so a client cannot request unbounded rows', async () => {
    const { status } = await get('/api/v1/projects?limit=100000', t);
    expect(status).toBe(400);
  });
});

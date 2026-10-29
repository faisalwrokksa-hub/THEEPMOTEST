import { describe, it, expect, beforeAll } from 'vitest';
import { API, login, as, get, reseed } from './helpers';

/**
 * A chart is only as honest as the query behind it. These check the two
 * things a reader would be misled by: a cumulative series that does not
 * actually accumulate, and a trend drawn from history that does not exist.
 */

let token: string;

beforeAll(async () => {
  reseed();
  token = (await login('fatima@al-nakheel.test')).token!;
}, 120_000);

describe('trends', () => {
  it('accumulates the S-curve monotonically', async () => {
    const { body } = await get('/api/v1/trends', token);
    expect(body.sCurve.length).toBeGreaterThan(1);
    for (const key of ['cumBudget', 'cumActual', 'cumForecast'] as const) {
      const vals = body.sCurve.map((p: any) => p[key]);
      for (let i = 1; i < vals.length; i++) {
        expect(vals[i], `${key} fell between ${body.sCurve[i - 1].period} and ${body.sCurve[i].period}`)
          .toBeGreaterThanOrEqual(vals[i - 1]);
      }
    }
  }, 60_000);

  it('ends the cumulative curve on the same totals the finance page reports', async () => {
    const trends = (await get('/api/v1/trends', token)).body;
    const fin = (await get('/api/v1/financials', token)).body;
    const last = trends.sCurve[trends.sCurve.length - 1];
    const totalBudget = fin.byProject.reduce((a: number, r: any) => a + r.budget, 0);
    const totalActual = fin.byProject.reduce((a: number, r: any) => a + r.actual, 0);
    // A chart that disagrees with the table beside it is worse than no chart.
    expect(Math.round(last.cumBudget)).toBe(Math.round(totalBudget));
    expect(Math.round(last.cumActual)).toBe(Math.round(totalActual));
  }, 60_000);

  it('leaves no month out of the series', async () => {
    const { body } = await get('/api/v1/trends', token);
    const months = body.sCurve.map((p: any) => p.period.slice(0, 7));
    for (let i = 1; i < months.length; i++) {
      const [py, pm] = months[i - 1].split('-').map(Number);
      const [cy, cm] = months[i].split('-').map(Number);
      expect(cy * 12 + cm, `gap between ${months[i - 1]} and ${months[i]}`).toBe(py * 12 + pm + 1);
    }
  }, 60_000);

  it('says how much history it has rather than drawing a trend from two points', async () => {
    const { body } = await get('/api/v1/trends', token);
    expect(body.historyNote).toHaveProperty('days');
    expect(body.historyNote.enough).toBe(body.historyNote.days >= 7);
    // Whatever history exists, it never claims more than it has.
    expect(body.history.length).toBe(body.historyNote.days);
  }, 60_000);

  it('records a snapshot that matches what the overview says right now', async () => {
    const res = await fetch(`${API}/api/v1/trends/capture`, { method: 'POST', headers: as(token) });
    expect(res.status).toBe(201);
    expect((await res.json()).workspaces).toBe(1); // never capture every tenant from HTTP

    const trends = (await get('/api/v1/trends', token)).body;
    const overview = (await get('/api/v1/overview', token)).body;
    const today = trends.history[trends.history.length - 1];
    expect(today.projects).toBe(overview.health.total);
    expect(today.gatesActive).toBe(overview.gates.active);
    expect(today.openRegister).toBe(overview.register.open);
  }, 60_000);

  it('does not allow a non-admin to capture even its own workspace', async () => {
    const staff = (await login('pm@pmoalign.test')).token!;
    const res = await fetch(`${API}/api/v1/trends/capture`, {
      method: 'POST', headers: as(staff),
    });
    expect(res.status).toBe(403);
  }, 60_000);

  it('refuses a workspace that has not licensed Analytics360', async () => {
    // Nexa is on a PMO-only plan. The chart is not merely hidden from its
    // menu — the endpoint behind it declines, which is the only version of
    // that control worth having.
    const khalid = (await login('khalid@nexa.test')).token!;
    const r = await fetch(`${API}/api/v1/trends`, { headers: as(khalid) });
    expect(r.status).toBe(403);
    expect((await r.json()).message).toMatch(/analytics360 is not enabled/i);
  }, 60_000);

  it('counts only the workspace asking', async () => {
    // Al-Nakheel is the only workspace licensed for this, so isolation is
    // checked against its own financials rather than by comparing tenants.
    const trends = (await get('/api/v1/trends', token)).body;
    const projects = (await get('/api/v1/projects', token)).body.items.map((p: any) => p.code);
    expect(projects).not.toContain('NXC');
    const last = trends.sCurve.at(-1);
    const fin = (await get('/api/v1/financials', token)).body;
    expect(fin.byProject.map((r: any) => r.code)).not.toContain('NXC');
    expect(Math.round(last.cumBudget))
      .toBe(Math.round(fin.byProject.reduce((a: number, r: any) => a + r.budget, 0)));
  }, 60_000);
});

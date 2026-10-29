import { describe, it, expect, beforeAll } from 'vitest';
import { API, login, get, reseed, as } from './helpers';

/** Live acceptance cases: require disposable seeded database and running API. */
let owner: string, reader: string, manager: string;
beforeAll(async () => {
  reseed();
  owner = (await login('fatima@al-nakheel.test')).token!;
  reader = (await login('engineer@al-nakheel.test')).token!;
  manager = (await login('portfolio@al-nakheel.test')).token!;
}, 120_000);

describe('finance permission boundary', () => {
  it('omits finances from restricted overview, analytics and trends', async () => {
    const o = await get('/api/v1/overview', reader);
    expect(o.status).toBe(200);
    expect(o.body.money).toBeNull();
    const a = await get('/api/v1/analytics', reader);
    expect(a.status).toBe(200);
    expect(a.body.spendByProject).toEqual([]);
    const t = await get('/api/v1/trends', reader);
    expect(t.status).toBe(200);
    expect(t.body.sCurve).toEqual([]);
  });
  it('omits project budget from list and project detail', async () => {
    const all = await get('/api/v1/projects', reader);
    expect(all.status).toBe(200);
    expect(all.body.items.every((p: any) => p.budgetAmount == null)).toBe(true);
    const detail = await get(`/api/v1/projects/${all.body.items[0].id}`, reader);
    expect(detail.status).toBe(200);
    expect(detail.body.budgetAmount).toBeNull();
  });
  it('refuses restricted Ask X facts, threads and prompts', async () => {
    for (const path of ['/api/v1/ask/facts', '/api/v1/ask', '/api/v1/ask/thread/00000000-0000-4000-8000-000000000000']) {
      expect((await get(path, reader)).status).toBe(403);
    }
  });
  it('blocks board packs and financial Excel downloads', async () => {
    for (const path of ['/api/v1/export/board-pack.docx', '/api/v1/export/board-pack.pptx', '/api/v1/excel/project?code=ANR']) {
      const result = await fetch(`${API}${path}`, { headers: as(reader) });
      expect(result.status).toBe(403);
    }
  });
  it('still permits financial users to access approved figures and Ask X grounding', async () => {
    const o = await get('/api/v1/overview', owner);
    expect(o.status).toBe(200);
    expect(o.body.money).toHaveProperty('budget');
    const f = await get('/api/v1/ask/facts', owner);
    expect(f.status).toBe(200);
  });
  it('manager may create projects but cannot import a workbook that rewrites finance records', async () => {
    const response = await fetch(`${API}/api/v1/excel/import`, { method: 'POST', headers: as(manager) });
    expect(response.status).toBe(403);
  });
});

import { describe, it, expect, beforeAll } from 'vitest';
import { API, login, as, get, reseed } from './helpers';

/**
 * The only thing worth testing about a grounded assistant is the grounding.
 * Whether the prose is good is a matter of taste; whether it can see another
 * workspace's money, or invents a figure, is not.
 */

let token: string;
const askable = () => Boolean(process.env.TEST_ASKX);

beforeAll(async () => {
  reseed();
  token = (await login('fatima@al-nakheel.test')).token!;
}, 120_000);

describe('Ask X grounding', () => {
  it('reports whether it is available without needing the model', async () => {
    const { status, body } = await get('/api/v1/ask/status', token);
    expect(status).toBe(200);
    expect(body).toHaveProperty('model');
    expect(body).toHaveProperty('region');
  });

  it('gathers only this workspace, and every project it does hold', async () => {
    const { body } = await get('/api/v1/ask/facts', token);
    const codes = body.projects.map((p: any) => p.code).sort();
    expect(codes).toEqual(expect.arrayContaining(['ANR', 'JWH', 'RCM']));
    expect(codes).not.toContain('NXC');           // that is Nexa's
    expect(body.workspace).toMatch(/Al-Nakheel/);
  });

  it('carries the gate verdict rather than leaving it to be inferred', async () => {
    const { body } = await get('/api/v1/ask/facts', token);
    const anr = body.projects.find((p: any) => p.code === 'ANR');
    // mayPass already encodes all three tests, so the model cannot reach a
    // different conclusion from the one the platform enforces.
    expect(anr.mayPass).toBe(false);
    expect(anr.blockers.join(' ')).toMatch(/bonds/i);
    expect(anr.gate).toMatch(/SG4/);
  });

  it('never exposes another workspace to a member of this one', async () => {
    const khalid = (await login('khalid@nexa.test')).token!;
    // Nexa has not licensed ai360 at all.
    const r = await fetch(`${API}/api/v1/ask/facts`, { headers: as(khalid) });
    expect(r.status).toBe(403);
  });

  it('refuses an empty question', async () => {
    const r = await fetch(`${API}/api/v1/ask`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...as(token) },
      body: JSON.stringify({ question: '   ' }),
    });
    expect(r.status).toBe(400);
  });

  it.runIf(askable())('answers from the records and stores what it was given', async () => {
    const r = await fetch(`${API}/api/v1/ask`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...as(token) },
      body: JSON.stringify({ question: 'Which gate is ANR on, and can it pass?' }),
    });
    expect(r.status).toBe(201);
    const body = await r.json();
    expect(body.answer).toMatch(/SG4/);
    expect(body.grounding.counts.projects).toBe(3);

    const thread = await get(`/api/v1/ask/thread/${body.threadId}`, token);
    expect(thread.body.map((m: any) => m.role)).toEqual(['user', 'assistant']);
  }, 240_000);
});

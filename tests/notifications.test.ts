import { describe, it, expect, beforeAll } from 'vitest';
import { API, login, as, get, reseed } from './helpers';

/**
 * Notification rules describe conditions rather than events, so the thing that
 * matters is not that a message is produced — it is that the same message is
 * not produced again tomorrow, and again the day after.
 */

let fatima: string, khalid: string;

const run = async (token: string) => {
  const res = await fetch(`${API}/api/v1/notifications/run`, { method: 'POST', headers: as(token) });
  return { status: res.status, body: await res.json().catch(() => null) };
};

beforeAll(async () => {
  reseed();
  fatima = (await login('fatima@al-nakheel.test')).token!;
  khalid = (await login('khalid@nexa.test')).token!;
}, 120_000);

describe('notifications', () => {
  it('tells the accountable owner what is actually blocking their gate', async () => {
    const r = await run(fatima);
    expect(r.status).toBe(201);
    expect(r.body.queued).toBeGreaterThan(0);

    const { body } = await get('/api/v1/notifications', fatima);
    const blocked = body.items.find((n: any) => n.kind === 'gate.blocked');
    expect(blocked, 'no gate.blocked notification was produced').toBeTruthy();
    expect(blocked.toEmail).toBe('fatima@al-nakheel.test');
    expect(blocked.subject).toMatch(/ANR/);
  }, 60_000);

  it('does not repeat itself while the situation is unchanged', async () => {
    const before = (await get('/api/v1/notifications', fatima)).body.items.length;
    await run(fatima);
    await run(fatima);
    const after = (await get('/api/v1/notifications', fatima)).body.items.length;
    expect(after).toBe(before);
  }, 60_000);

  it('keeps one workspace out of another workspace outbox', async () => {
    await run(fatima);
    const nexa = await get('/api/v1/notifications', khalid);
    const leaked = nexa.body.items.filter((n: any) => /al-nakheel/i.test(n.toEmail));
    expect(leaked).toEqual([]);
  }, 60_000);

  it('records rather than discards when no transport is configured', async () => {
    const { body } = await get('/api/v1/notifications', fatima);
    // The default build has no mail transport; queued is the honest state for
    // a message that is waiting on configuration, not one that failed.
    if (!body.transport.delivers) {
      expect(body.counts.failed ?? 0).toBe(0);
      expect(body.counts.queued ?? 0).toBeGreaterThan(0);
      expect(body.transport.status).toMatch(/recorded/i);
    }
  }, 60_000);

  it('sends a scheduled report once per period, not once per run', async () => {
    await run(fatima);
    const first = (await get('/api/v1/notifications', fatima)).body.items
      .filter((n: any) => n.kind === 'report.board_pack');
    expect(first.length, 'no scheduled report was produced').toBeGreaterThan(0);

    await run(fatima);
    await run(fatima);
    const again = (await get('/api/v1/notifications', fatima)).body.items
      .filter((n: any) => n.kind === 'report.board_pack');
    expect(again.length).toBe(first.length);
  }, 60_000);

  it('will not let a non-admin read recipient addresses or delivery failures', async () => {
    const viewer = await login('pm@pmoalign.test');
    const result = await get('/api/v1/notifications', viewer.token!);
    expect([401, 403]).toContain(result.status);
  }, 60_000);

  it('will not let a non-admin trigger a run', async () => {
    const viewer = await login('pm@pmoalign.test');
    const r = await run(viewer.token!);
    expect([401, 403]).toContain(r.status);
  }, 60_000);
});

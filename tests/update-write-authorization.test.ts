import { describe, it, expect, beforeAll } from 'vitest';
import { API, as, get, login, reseed } from './helpers';

/** Runs only against the disposable PostgreSQL database, with the API running. */
describe.runIf(process.env.P0_UPDATES_LIVE_ACCEPTANCE === 'true')('Update feed authorization', () => {
  beforeAll(() => reseed(), 120_000);

  it('allows executives to read updates but forbids them from writing', async () => {
    const executive = await login('exec@al-nakheel.test');
    expect(executive.res.status).toBe(200);
    expect(executive.token).toBeTruthy();
    expect((await get('/api/v1/updates', executive.token)).status).toBe(200);
    const post = await fetch(`${API}/api/v1/create/update`, {
      method: 'POST', headers: { ...as(executive.token), 'content-type': 'application/json' },
      body: JSON.stringify({ kind: 'note', body: 'Read-only user should not be able to publish' }),
    });
    expect(post.status).toBe(403);
  });

  it('allows authenticated delivery contributors to publish updates', async () => {
    const contributor = await login('pm@pmoalign.test');
    expect(contributor.res.status).toBe(200);
    expect(contributor.token).toBeTruthy();
    const post = await fetch(`${API}/api/v1/create/update`, {
      method: 'POST', headers: { ...as(contributor.token), 'content-type': 'application/json' },
      body: JSON.stringify({ kind: 'status', body: 'Disposable test: approved contributor update' }),
    });
    expect(post.status).toBe(201);
    expect((await get('/api/v1/updates', contributor.token)).status).toBe(200);
  });

  it('rejects anonymous update publishing', async () => {
    const post = await fetch(`${API}/api/v1/create/update`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind: 'note', body: 'Anonymous user publishing' }),
    });
    expect(post.status).toBe(401);
  });
});

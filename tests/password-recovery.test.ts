/**
 * P0 real-infrastructure recovery test. Intentionally skipped unless explicitly
 * opted into a disposable loopback PostgreSQL/API stack. Never run on customer data.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { randomBytes, createHash } from 'node:crypto';
import { API, get, login, psql, reseed } from './helpers';
import { assertDisposableAcceptanceConfig } from '../scripts/phase15c-acceptance-safety.mjs';

const enabled = process.env.P0_RECOVERY_LIVE_ACCEPTANCE === 'true';
beforeAll(() => {
  if (!enabled) return;
  assertDisposableAcceptanceConfig({ ...process.env, PHASE15_BILLING_ACCEPTANCE: 'true' });
  reseed();
});

describe.skipIf(!enabled)('P0 real password recovery / PostgreSQL privilege boundary', () => {
  it('consumes token once, revokes all user sessions, preserves other accounts', async () => {
    const a = await login('fatima@al-nakheel.test');
    const b = await login('fatima@al-nakheel.test');
    const other = await login('pm@pmoalign.test');
    expect(a.res.status).toBe(200);
    expect(b.res.status).toBe(200);
    expect(other.res.status).toBe(200);

    const userId = psql("SELECT id FROM public.users WHERE email='fatima@al-nakheel.test'");
    expect(userId).toMatch(/^[0-9a-f-]{36}$/i);
    const previousResets = Number(psql(`SELECT count(*) FROM public.auth_events WHERE user_id='${userId}'
      AND action='password.reset.completed'`));
    const token = randomBytes(32).toString('base64url');
    const tokenHash = createHash('sha256').update(token).digest('hex');
    // Test-only token creation with an ADMIN connection. No SES email is sent.
    psql(`INSERT INTO public.auth_password_resets(user_id,token_hash,expires_at)
      VALUES ('${userId}','${tokenHash}',now()+interval '30 minutes')`);

    const newPassword = 'example-new-password-2026';
    const reset = await fetch(`${API}/auth/password-recovery/reset`, {
      method:'POST', headers:{'content-type':'application/json'},
      body:JSON.stringify({token,password:newPassword}),
    });
    expect(reset.status).toBe(200);
    expect((await get('/api/v1/projects', a.token)).status).toBe(401);
    expect((await get('/api/v1/projects', b.token)).status).toBe(401);
    expect((await get('/api/v1/projects', other.token)).status).toBe(200);
    expect((await login('fatima@al-nakheel.test', 'pmoalign-dev')).res.status).toBe(401);
    expect((await login('fatima@al-nakheel.test', newPassword)).res.status).toBe(200);

    const replay = await fetch(`${API}/auth/password-recovery/reset`, {
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({token,password:'another-example-password'}),
    });
    expect(replay.status).toBe(400);
    expect(Number(psql(`SELECT count(*) FROM public.auth_events WHERE user_id='${userId}'
      AND action='password.reset.completed'`))).toBe(previousResets + 1);
  }, 60_000);

  it('serializes simultaneous use of one recovery link into exactly one password change', async () => {
    const userId = psql("SELECT id FROM public.users WHERE email='khalid@nexa.test'");
    expect(userId).toMatch(/^[0-9a-f-]{36}$/i);
    const token = randomBytes(32).toString('base64url');
    const hash = createHash('sha256').update(token).digest('hex');
    const before = Number(psql(`SELECT count(*) FROM public.auth_events WHERE user_id='${userId}'
      AND action='password.reset.completed'`));
    psql(`INSERT INTO public.auth_password_resets(user_id,token_hash,expires_at)
      VALUES ('${userId}','${hash}',now()+interval '30 minutes')`);
    const runReset = (password: string) => fetch(`${API}/auth/password-recovery/reset`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token, password }),
    });
    const [a, b] = await Promise.all([
      runReset('concurrent-password-option-A-2026'),
      runReset('concurrent-password-option-B-2026'),
    ]);
    expect([a.status, b.status].sort((x,y)=>x-y)).toEqual([200,400]);
    expect(Number(psql(`SELECT count(*) FROM public.auth_events WHERE user_id='${userId}'
      AND action='password.reset.completed'`))).toBe(before + 1);
    const goodA = await login('khalid@nexa.test', 'concurrent-password-option-A-2026');
    const goodB = await login('khalid@nexa.test', 'concurrent-password-option-B-2026');
    expect([goodA.res.status, goodB.res.status].sort((x,y)=>x-y)).toEqual([200,401]);
  }, 60_000);

  it('rejects expired tokens, malformed inputs and cross-site recovery', async () => {
    const id = psql("SELECT id FROM public.users WHERE email='khalid@nexa.test'");
    const token = randomBytes(32).toString('base64url');
    const hash = createHash('sha256').update(token).digest('hex');
    psql(`INSERT INTO public.auth_password_resets(user_id,token_hash,created_at,expires_at)
      VALUES ('${id}','${hash}',now()-interval '1 hour',now()-interval '30 minutes')`);
    const result = await fetch(`${API}/auth/password-recovery/reset`, {
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({token,password:'valid-but-expired-123'}),
    });
    expect(result.status).toBe(400);
    const blocked = await fetch(`${API}/auth/password-recovery/reset`, {
      method:'POST', headers:{ 'content-type':'application/json',
        origin:'https://attacker.invalid','sec-fetch-site':'cross-site' },
      body:JSON.stringify({token,password:'valid-but-expired-123'}),
    });
    expect(blocked.status).toBe(403);
  },60_000);
});

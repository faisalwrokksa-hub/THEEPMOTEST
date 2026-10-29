import { execFileSync } from 'node:child_process';

export const API = process.env.TEST_API ?? 'http://localhost:4000';

export async function login(identifier: string, password = 'pmoalign-dev') {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ identifier, password }),
  });
  const setCookie = res.headers.getSetCookie?.() ?? [];
  const token = setCookie.find((c) => c.startsWith('pmo_session='))?.split(';')[0].split('=')[1];
  return { res, token };
}

export const as = (token?: string) =>
  token ? { cookie: `pmo_session=${token}` } : {};

export async function get(path: string, token?: string) {
  const res = await fetch(`${API}${path}`, { headers: as(token) });
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

/**
 * Restore the seed. Any test file that mutates governance state calls this in
 * beforeAll, so files stay independent of the order they happen to run in.
 */
export function reseed() {
  execFileSync('pnpm', ['db:seed'], { stdio: 'ignore' });
}

/** Use the configured admin connection in CI; keep the named local container as a fallback. */
export const psql = (q: string) => {
  const url = process.env.DATABASE_URL_ADMIN;
  if (url) {
    return execFileSync('psql', [url, '-X', '-v', 'ON_ERROR_STOP=1', '-tAc', q],
      { encoding: 'utf8' }).trim();
  }
  return execFileSync('docker', ['exec', 'pmo-postgres', 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'pmo', '-tAc', q],
    { encoding: 'utf8' }).trim();
};

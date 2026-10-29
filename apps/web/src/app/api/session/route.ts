import { rejectUnsafeBrowserMutation } from '@/lib/check-browser-mutation';
import { NextRequest, NextResponse } from 'next/server';
import { publicUrl } from '@/lib/public-url';

const BASE = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const SESSION = 'pmo_session';

/**
 * Sign-in as a plain form POST rather than a Server Action.
 *
 * Deliberate: a route handler has a stable URL, so it survives a dev-server
 * restart and works with JavaScript disabled. Server Actions get a fresh
 * generated id on every build, which is what produced
 * "Server Action … was not found on the server" on an already-open tab.
 */
export async function POST(req: NextRequest) {
  const blocked = rejectUnsafeBrowserMutation(req);
  if (blocked) return blocked;
  const form = await req.formData();
  const identifier = String(form.get('identifier') ?? form.get('email') ?? '').trim();
  const password = String(form.get('password') ?? '');
  const back = (msg: string) =>
    NextResponse.redirect(publicUrl(req, `/login?error=${encodeURIComponent(msg)}`), 303);

  if (!identifier || !password) return back('Enter your username and password.');

  let res: Response;
  try {
    res = await fetch(`${BASE}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ identifier, password }),
      cache: 'no-store',
    });
  } catch {
    return back('Cannot reach the server. Is the API running?');
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({} as any));
    return back(body?.message ?? 'Those credentials are not recognised.');
  }

  const line = (res.headers.getSetCookie?.() ?? []).find((c) => c.startsWith(`${SESSION}=`));
  const token = line?.split(';')[0]?.split('=')[1];
  if (!token) return back('Signed in, but no session was returned.');

  const out = NextResponse.redirect(publicUrl(req, '/'), 303);
  out.cookies.set(SESSION, token, {
    httpOnly: true, sameSite: 'lax', path: '/',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 24 * 7,
  });
  return out;
}

import { rejectUnsafeBrowserMutation } from '@/lib/check-browser-mutation';
import { NextRequest, NextResponse } from 'next/server';
import { publicUrl } from '@/lib/public-url';

const BASE = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const SESSION = 'pmo_session';

/** Revokes the session server-side, then clears the cookie. */
export async function POST(req: NextRequest) {
  const blocked = rejectUnsafeBrowserMutation(req);
  if (blocked) return blocked;
  const token = req.cookies.get(SESSION)?.value;
  if (token) {
    try {
      const result = await fetch(`${BASE}/auth/logout`, {
        method: 'POST', headers: { cookie: `${SESSION}=${token}` }, cache: 'no-store',
      });
      if (!result.ok) throw new Error('Session revocation failed');
    } catch {
      // Do not claim logout succeeded while the server-side session remains valid.
      return NextResponse.json({ error: 'Sign-out could not be confirmed. Please try again.' },
        { status: 503, headers: { 'cache-control': 'no-store' } });
    }
  }
  const out = NextResponse.redirect(publicUrl(req, '/login'), 303);
  out.cookies.delete(SESSION);
  return out;
}

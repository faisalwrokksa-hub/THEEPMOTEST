import { rejectUnsafeBrowserMutation } from '@/lib/check-browser-mutation';
import { NextRequest, NextResponse } from 'next/server';
import { publicUrl } from '@/lib/public-url';

const BASE = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const SESSION = 'pmo_session';

/** Account-wide session revocation, including other devices and workspaces. */
export async function POST(req: NextRequest) {
  const blocked = rejectUnsafeBrowserMutation(req);
  if (blocked) return blocked;
  const token = req.cookies.get(SESSION)?.value;
  if (!token) return NextResponse.redirect(publicUrl(req, '/login'), 303);
  try {
    const response = await fetch(`${BASE}/auth/logout-all`, {
      method: 'POST', headers: { cookie: `${SESSION}=${token}` }, cache: 'no-store',
    });
    if (!response.ok) throw new Error('Session revocation not confirmed');
  } catch {
    // Never redirect as if every device was signed out when the API is down.
    return NextResponse.json({ error: 'Could not sign out all devices. Please retry.' },
      { status: 503, headers: { 'cache-control': 'no-store' } });
  }
  const result = NextResponse.redirect(publicUrl(req, '/login'), 303);
  result.cookies.delete(SESSION);
  return result;
}

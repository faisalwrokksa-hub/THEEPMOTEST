import { rejectUnsafeBrowserMutation } from '@/lib/check-browser-mutation';
import { logoutFailureResponse } from '@/lib/logout-recovery';
import { fetchTenantMutation } from '@/lib/tenant-mutation-fetch.mjs';
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
      const result = await fetchTenantMutation(fetch, `${BASE}/auth/logout`, {
        method: 'POST', headers: { cookie: `${SESSION}=${token}` }, cache: 'no-store',
      });
      if (!result?.ok) throw new Error('Session revocation failed');
    } catch {
      // Do not claim success or clear the cookie if revocation is unconfirmed.
      return logoutFailureResponse(req, false);
    }
  }
  const out = NextResponse.redirect(publicUrl(req, '/login'), 303);
  out.cookies.delete(SESSION);
  return out;
}

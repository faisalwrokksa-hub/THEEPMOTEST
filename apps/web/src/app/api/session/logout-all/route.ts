import { rejectUnsafeBrowserMutation } from '@/lib/check-browser-mutation';
import { logoutFailureResponse } from '@/lib/logout-recovery';
import { fetchTenantMutation } from '@/lib/tenant-mutation-fetch.mjs';
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
    const response = await fetchTenantMutation(fetch, `${BASE}/auth/logout-all`, {
      method: 'POST', headers: { cookie: `${SESSION}=${token}` }, cache: 'no-store',
    });
    if (!response?.ok) throw new Error('Session revocation not confirmed');
  } catch {
    // Do not claim all devices were signed out if the API is unavailable.
    return logoutFailureResponse(req, true);
  }
  const result = NextResponse.redirect(publicUrl(req, '/login'), 303);
  result.cookies.delete(SESSION);
  return result;
}

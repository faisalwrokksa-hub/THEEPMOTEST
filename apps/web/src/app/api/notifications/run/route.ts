import { rejectUnsafeBrowserMutation } from '@/lib/check-browser-mutation';
import { NextRequest, NextResponse } from 'next/server';
import { publicUrl } from '@/lib/public-url';

const BASE = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const SESSION = 'pmo_session';

/** Evaluate the notification rules now instead of waiting for the hourly run. */
export async function POST(req: NextRequest) {
  const blocked = rejectUnsafeBrowserMutation(req);
  if (blocked) return blocked;
  const token = req.cookies.get(SESSION)?.value;
  if (!token) return NextResponse.redirect(publicUrl(req, '/login'), 303);

  const back = publicUrl(req, '/notifications');
  const res = await fetch(`${BASE}/api/v1/notifications/run`, {
    method: 'POST', headers: { cookie: `${SESSION}=${token}` }, cache: 'no-store',
  }).catch(() => null);

  if (!res?.ok) {
    const body = await res?.json().catch(() => ({} as any));
    back.searchParams.set('error', body?.message ?? 'Could not run the rules.');
  } else {
    back.searchParams.set('done', 'run');
  }
  return NextResponse.redirect(back, 303);
}

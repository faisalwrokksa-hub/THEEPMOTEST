import { NextRequest, NextResponse } from 'next/server';
import { publicUrl } from '@/lib/public-url';
import { rejectUnsafeBrowserMutation } from '@/lib/check-browser-mutation';

const BASE = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const COOKIE = 'pmo_session';

/** Authenticated same-origin proxy; the API enforces tenant and capability checks. */
export async function POST(req: NextRequest) {
  const unsafe = rejectUnsafeBrowserMutation(req);
  if (unsafe) return unsafe;
  const token = req.cookies.get(COOKIE)?.value;
  if (!token) return NextResponse.redirect(publicUrl(req, '/login'), 303);
  const target = publicUrl(req, '/billing');
  const action = (await req.formData()).get('action');
  const path = action === 'schedule-cancellation' ? '/api/v1/subscription/cancel-at-period-end'
    : action === 'resume' ? '/api/v1/subscription/resume' : null;
  if (!path) {
    target.searchParams.set('error', 'invalid-action');
    return NextResponse.redirect(target, 303);
  }
  const response = await fetch(`${BASE}${path}`, {
    method: 'POST', cache: 'no-store', redirect: 'error',
    headers: { 'content-type': 'application/json', cookie: `${COOKIE}=${token}` },
    body: '{}',
  }).catch(() => null);
  // Never forward the authenticated session cookie through an upstream redirect.
  if (!response || response.redirected || (response.status >= 300 && response.status < 400) || !response.ok) {
    target.searchParams.set('error', 'subscription-action-failed');
    return NextResponse.redirect(target, 303);
  }
  target.searchParams.set('updated', '1');
  return NextResponse.redirect(target, 303);
}

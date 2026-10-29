import { NextRequest, NextResponse } from 'next/server';
import { rejectUnsafeBrowserMutation } from '@/lib/check-browser-mutation';

const BASE = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
/** No session required: the secret emailed to the recipient authorizes only joining. */
export async function POST(req: NextRequest) {
  const unsafe = rejectUnsafeBrowserMutation(req);
  if (unsafe) return unsafe;
  const body = await req.json().catch(() => null);
  if (!body || typeof body.token !== 'string' || body.token.length > 100 ||
      typeof body.displayName !== 'string' || body.displayName.length > 120 ||
      typeof body.password !== 'string' || body.password.length > 200)
    return NextResponse.json({ message: 'Invalid invitation submission' }, { status: 400 });
  const result = await fetch(`${BASE}/api/v1/onboarding/invitation/accept`, {
    method: 'POST', cache: 'no-store',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token: body.token, displayName: body.displayName || undefined,
      password: body.password || undefined }),
  }).catch(() => null);
  if (!result) return NextResponse.json({ message: 'The service is currently unavailable' }, { status: 503 });
  // Never echo the token in a response or log it.
  if (!result.ok) {
    const problem = await result.json().catch(() => null);
    return NextResponse.json({ message: typeof problem?.message === 'string'
      ? problem.message : 'The invitation could not be accepted' }, { status: result.status });
  }
  return NextResponse.json({ ok: true });
}

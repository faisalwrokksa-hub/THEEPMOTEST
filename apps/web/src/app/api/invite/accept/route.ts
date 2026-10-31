import { NextRequest, NextResponse } from 'next/server';
import { rejectUnsafeBrowserMutation } from '@/lib/check-browser-mutation';
import { validInvitationToken } from '@/lib/invitation-feedback.mjs';
import { readBoundedBrowserJson } from '@/lib/bounded-browser-json.mjs';

const BASE = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const NO_STORE = { 'cache-control': 'no-store' };

/** No session required: the emailed bearer secret authorizes only joining. */
export async function POST(req: NextRequest) {
  const unsafe = rejectUnsafeBrowserMutation(req);
  if (unsafe) return unsafe;
  const parsed = await readBoundedBrowserJson(req);
  if (!parsed.value) return NextResponse.json({ message: 'Invalid invitation submission' },
    { status: parsed.error === 'too-large' ? 413 : 400, headers: NO_STORE });
  const body = parsed.value;
  if (!body || !validInvitationToken(body.token) ||
      typeof body.displayName !== 'string' || body.displayName.length > 120 ||
      typeof body.password !== 'string' || body.password.length > 200)
    return NextResponse.json({ message: 'Invalid invitation submission' },
      { status: 400, headers: NO_STORE });

  const result = await fetch(`${BASE}/api/v1/onboarding/invitation/accept`, {
    method: 'POST', cache: 'no-store', redirect: 'error',
    // Bound invitation-token forwarding when the upstream service stalls.
    signal: AbortSignal.timeout(15_000),
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token: body.token, displayName: body.displayName || undefined,
      password: body.password || undefined }),
  }).catch(() => null);
  if (!result) return NextResponse.json({ message: 'The service is currently unavailable' },
    { status: 503, headers: NO_STORE });

  // Never reflect upstream response bodies: they may contain sensitive details.
  // Preserve safe HTTP status for localized client guidance only.
  if (!result.ok) {
    const status = result.status >= 400 && result.status <= 599 ? result.status : 502;
    return NextResponse.json({ message: 'The invitation could not be accepted' },
      { status, headers: NO_STORE });
  }
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}

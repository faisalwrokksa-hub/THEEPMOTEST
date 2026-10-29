import { safeReturnPath } from '@/lib/browser-mutation';
import { rejectUnsafeBrowserMutation } from '@/lib/check-browser-mutation';
import { NextRequest, NextResponse } from 'next/server';
import { publicUrl } from '@/lib/public-url';

const BASE = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const SESSION = 'pmo_session';

/** Switches the active workspace. The API refuses any tenant you are not a member of. */
export async function POST(req: NextRequest) {
  const blocked = rejectUnsafeBrowserMutation(req);
  if (blocked) return blocked;
  const token = req.cookies.get(SESSION)?.value;
  if (!token) return NextResponse.redirect(publicUrl(req, '/login'), 303);

  const form = await req.formData();
  const tenantId = String(form.get('tenantId') ?? '');
  const to = String(form.get('returnTo') ?? '/');

  await fetch(`${BASE}/auth/switch-tenant`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: `${SESSION}=${token}` },
    body: JSON.stringify({ tenantId }),
    cache: 'no-store',
  }).catch(() => {});

  return NextResponse.redirect(publicUrl(req, safeReturnPath(to, '/')), 303);
}

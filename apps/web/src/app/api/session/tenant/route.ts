import { safeReturnPath } from '@/lib/browser-mutation';
import { tenantSwitchLandingPath } from '@/lib/tenant-switch-landing.mjs';
import { rejectUnsafeBrowserMutation } from '@/lib/check-browser-mutation';
import { NextRequest, NextResponse } from 'next/server';
import { publicUrl } from '@/lib/public-url';
import { readBoundedBrowserForm } from '@/lib/bounded-browser-form.mjs';
import { fetchTenantMutation } from '@/lib/tenant-mutation-fetch.mjs';
import { tenantSwitchFailurePath } from '@/lib/tenant-switch-feedback.mjs';
import { uuidPathSegment } from '@/lib/uuid-path.mjs';

const BASE = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const SESSION = 'pmo_session';

/** Switches the active workspace. The API refuses any tenant you are not a member of. */
export async function POST(req: NextRequest) {
  const blocked = rejectUnsafeBrowserMutation(req);
  if (blocked) return blocked;
  const token = req.cookies.get(SESSION)?.value;
  if (!token) return NextResponse.redirect(publicUrl(req, '/login'), 303);

  const parsed = await readBoundedBrowserForm(req);
  if (!parsed.form) return NextResponse.json({
    error: parsed.error === 'too-large'
      ? 'Form submission exceeds the size limit.' : 'Invalid form submission.',
  }, { status: parsed.error === 'too-large' ? 413 : 400 });
  const form = parsed.form;
  let tenantId: string;
  try { tenantId = uuidPathSegment(form.get('tenantId')); }
  catch { return NextResponse.json({ error: 'Invalid workspace identifier.' }, { status: 400 }); }
  const to = String(form.get('returnTo') ?? '/');

  // Never follow redirects with the session cookie or replay an ambiguous
  // workspace switch. A failed switch must not appear to have succeeded.
  const response = await fetchTenantMutation(fetch, `${BASE}/auth/switch-tenant`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: `${SESSION}=${token}` },
    body: JSON.stringify({ tenantId }),
    cache: 'no-store',
  });

  if (!response?.ok) {
    return NextResponse.redirect(publicUrl(req, tenantSwitchFailurePath(response?.status)), 303);
  }
  // A project or programme deep link belongs to the previous workspace.
  // Preserve only shared index routes, dropping old filters and flash messages.
  const safeTo = safeReturnPath(to, '/');
  const landing = tenantSwitchLandingPath(to === safeTo ? safeTo : '/');
  return NextResponse.redirect(publicUrl(req, landing), 303);
}

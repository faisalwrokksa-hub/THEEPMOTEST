import { rejectUnsafeBrowserMutation } from '@/lib/check-browser-mutation';
import { NextRequest, NextResponse } from 'next/server';
import { publicUrl } from '@/lib/public-url';
import { readBoundedBrowserForm } from '@/lib/bounded-browser-form.mjs';
import { fetchTenantMutation } from '@/lib/tenant-mutation-fetch.mjs';
import { safeMutationError } from '@/lib/safe-mutation-feedback.mjs';

const BASE = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const SESSION = 'pmo_session';

/** Enable or disable a module. The API re-checks the admin capability. */
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
  const f = parsed.form;
  // Module IDs are catalogue slugs, not arbitrary URL path segments.
  const id = f.get('id');
  if (typeof id !== 'string' || !/^[a-z][a-z0-9_-]{0,63}$/.test(id)) {
    return NextResponse.json({ error: 'Invalid module identifier.' }, { status: 400 });
  }
  const res = await fetchTenantMutation(fetch, `${BASE}/api/v1/platform/modules/${id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', cookie: `${SESSION}=${token}` },
    body: JSON.stringify({ enabled: String(f.get('enabled')) === 'true' }),
    cache: 'no-store',
  });

  const url = publicUrl(req, '/platform');
  // Do not expose upstream exception messages or follow a redirect with
  // the session cookie and privileged module toggle payload.
  if (!res?.ok) url.searchParams.set('error', safeMutationError(res?.status ?? 503));
  else url.searchParams.set('done', '1');
  return NextResponse.redirect(url, 303);
}

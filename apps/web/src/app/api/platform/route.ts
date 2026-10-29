import { rejectUnsafeBrowserMutation } from '@/lib/check-browser-mutation';
import { NextRequest, NextResponse } from 'next/server';
import { publicUrl } from '@/lib/public-url';

const BASE = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const SESSION = 'pmo_session';

/** Enable or disable a module. The API re-checks the admin capability. */
export async function POST(req: NextRequest) {
  const blocked = rejectUnsafeBrowserMutation(req);
  if (blocked) return blocked;
  const token = req.cookies.get(SESSION)?.value;
  if (!token) return NextResponse.redirect(publicUrl(req, '/login'), 303);

  const f = await req.formData();
  const res = await fetch(`${BASE}/api/v1/platform/modules/${String(f.get('id'))}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', cookie: `${SESSION}=${token}` },
    body: JSON.stringify({ enabled: String(f.get('enabled')) === 'true' }),
    cache: 'no-store',
  });

  const url = publicUrl(req, '/platform');
  if (!res.ok) {
    const j = await res.json().catch(() => ({} as any));
    url.searchParams.set('error', j?.message ?? `Could not change that module (${res.status})`);
  } else url.searchParams.set('done', '1');
  return NextResponse.redirect(url, 303);
}

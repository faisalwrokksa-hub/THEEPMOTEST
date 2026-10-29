import { NextRequest, NextResponse } from 'next/server';
import { publicUrl } from '@/lib/public-url';

const BASE = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const SESSION = 'pmo_session';

/**
 * Streams a workbook from the API through the web app.
 *
 * The browser never talks to the API directly — the session cookie is scoped
 * to this origin — so the download is proxied rather than linked.
 */
export async function GET(req: NextRequest) {
  const token = req.cookies.get(SESSION)?.value;
  if (!token) return NextResponse.redirect(publicUrl(req, '/login'), 303);

  const q = req.nextUrl.searchParams;
  const code = q.get('code')?.trim();
  const lang = q.get('lang') === 'ar' ? 'ar' : 'en';
  const path = code
    ? `/api/v1/excel/project?code=${encodeURIComponent(code)}&lang=${lang}`
    : `/api/v1/excel/template?lang=${lang}`;

  const res = await fetch(`${BASE}${path}`, {
    headers: { cookie: `${SESSION}=${token}` }, cache: 'no-store',
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({} as any));
    const url = publicUrl(req, '/data');
    url.searchParams.set('error', body?.message ?? `Could not build that workbook (${res.status}).`);
    return NextResponse.redirect(url, 303);
  }

  return new NextResponse(res.body, {
    headers: {
      'content-type': res.headers.get('content-type') ?? 'application/octet-stream',
      'content-disposition': res.headers.get('content-disposition') ?? 'attachment',
      'cache-control': 'no-store',
    },
  });
}

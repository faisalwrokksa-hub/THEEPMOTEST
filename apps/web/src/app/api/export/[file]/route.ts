import { NextRequest, NextResponse } from 'next/server';
import { publicUrl } from '@/lib/public-url';

const BASE = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const SESSION = 'pmo_session';

/**
 * Only these, by exact name. The path segment names a file the API knows how
 * to build; it is never a URL to fetch, so this cannot become an open proxy.
 */
const ALLOWED = new Set(['board-pack.docx', 'board-pack.pptx', 'board-pack.pdf']);

export async function GET(req: NextRequest, { params }: { params: Promise<{ file: string }> }) {
  const token = req.cookies.get(SESSION)?.value;
  if (!token) return NextResponse.redirect(publicUrl(req, '/login'), 303);

  const { file } = await params;
  if (!ALLOWED.has(file)) return new NextResponse('Not found', { status: 404 });

  const lang = req.nextUrl.searchParams.get('lang') === 'ar' ? 'ar' : 'en';
  // The PDF is printed by a headless browser, which has to load the pack and
  // its webfonts first — several seconds, against milliseconds for a docx.
  const res = await fetch(`${BASE}/api/v1/export/${file}?lang=${lang}`, {
    headers: { cookie: `${SESSION}=${token}` }, cache: 'no-store',
    signal: AbortSignal.timeout(file.endsWith('.pdf') ? 90_000 : 30_000),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({} as any));
    const url = publicUrl(req, '/reports');
    url.searchParams.set('error', body?.message ?? `Could not generate that file (${res.status}).`);
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

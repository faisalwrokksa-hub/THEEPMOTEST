import { rejectUnsafeBrowserMutation } from '@/lib/check-browser-mutation';
import { NextRequest, NextResponse } from 'next/server';

const BASE = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const SESSION = 'pmo_session';

/**
 * A thin pass-through to the Microsoft routes on the API.
 *
 * The browser cannot call the API directly — the session cookie is first-party
 * to the web origin and the API is not public — so every write the Integrations
 * page makes comes through here. It forwards the cookie, the method and the
 * body, and hands back whatever the API said, including the status, because the
 * page's error messages are the API's own.
 */
async function proxy(req: NextRequest, path: string[]) {
  if (req.method !== 'GET') {
    const blocked = rejectUnsafeBrowserMutation(req);
    if (blocked) return blocked;
  }
  const token = req.cookies.get(SESSION)?.value;
  if (!token) return NextResponse.json({ error: 'Sign in again.' }, { status: 401 });

  const search = req.nextUrl.search;
  const isUpload = (req.headers.get('content-type') ?? '').includes('multipart/form-data');
  const init: RequestInit = {
    method: req.method,
    headers: {
      cookie: `${SESSION}=${token}`,
      // Multipart carries its own boundary in the content type, so that header
      // must be passed through untouched rather than reconstructed.
      ...(isUpload ? { 'content-type': req.headers.get('content-type')! } : {}),
      ...(!isUpload && req.method !== 'GET' ? { 'content-type': 'application/json' } : {}),
    },
    body: req.method === 'GET' || req.method === 'DELETE' ? undefined
      : isUpload ? await req.arrayBuffer() : await req.text(),
    cache: 'no-store',
    // A download link answers with a redirect to Microsoft's own URL; following
    // it here would stream the file through this process for no reason.
    redirect: 'manual',
  };

  let res: Response;
  try {
    res = await fetch(`${BASE}/api/v1/microsoft/${path.join('/')}${search}`, init);
  } catch {
    return NextResponse.json({ error: 'Cannot reach the server.' }, { status: 502 });
  }

  const location = res.headers.get('location');
  if (location && res.status >= 300 && res.status < 400) {
    return NextResponse.redirect(location, 302);
  }
  const text = await res.text();
  return new NextResponse(text || null, {
    status: res.status,
    headers: { 'content-type': res.headers.get('content-type') ?? 'application/json' },
  });
}

export const GET = (req: NextRequest, c: { params: Promise<{ path: string[] }> }) =>
  c.params.then((p) => proxy(req, p.path));
export const POST = (req: NextRequest, c: { params: Promise<{ path: string[] }> }) =>
  c.params.then((p) => proxy(req, p.path));
export const DELETE = (req: NextRequest, c: { params: Promise<{ path: string[] }> }) =>
  c.params.then((p) => proxy(req, p.path));

import { rejectUnsafeBrowserMutation } from '@/lib/check-browser-mutation';
import { NextRequest, NextResponse } from 'next/server';
import { publicUrl } from '@/lib/public-url';

const BASE = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const SESSION = 'pmo_session';

/**
 * Takes the uploaded workbook and hands it to the API as multipart.
 *
 * Answers JSON when the caller asks for it, because the import can come back
 * with a question — this project code is taken, update it instead? — and the
 * answer means sending the very same file again. A redirect cannot carry a
 * file, so the page keeps hold of it and re-posts; only the plain no-JavaScript
 * path still redirects.
 */
export async function POST(req: NextRequest) {
  const blocked = rejectUnsafeBrowserMutation(req);
  if (blocked) return blocked;
  const wantsJson = (req.headers.get('accept') ?? '').includes('application/json');
  const token = req.cookies.get(SESSION)?.value;
  if (!token) {
    const login = publicUrl(req, '/login').toString();
    return wantsJson
      ? NextResponse.json({ error: 'Your session has expired. Sign in again.' }, { status: 401 })
      : NextResponse.redirect(login, 303);
  }

  const back = publicUrl(req, '/data');
  const form = await req.formData();
  const file = form.get('file');
  
  if (!(file instanceof File) || file.size === 0) {
    const msg = 'Choose a .xlsx workbook to upload.';
    if (wantsJson) return NextResponse.json({ error: msg }, { status: 400 });
    back.searchParams.set('error', msg);
    return NextResponse.redirect(back, 303);
  }

  const out = new FormData();
  out.append('file', file, file.name);


  let res: Response;
  try {
    res = await fetch(`${BASE}/api/v1/excel/preview`, {
      method: 'POST', headers: { cookie: `${SESSION}=${token}` }, body: out, cache: 'no-store',
    });
  } catch {
    const msg = 'Cannot reach the server.';
    if (wantsJson) return NextResponse.json({ error: msg }, { status: 502 });
    back.searchParams.set('error', msg);
    return NextResponse.redirect(back, 303);
  }

  const body = await res.json().catch(() => ({}) as any);
  if (!res.ok) {
    const msg = body?.message ?? `Import failed (${res.status}).`;
    if (wantsJson) return NextResponse.json({ error: msg }, { status: res.status });
    back.searchParams.set('error', msg);
    return NextResponse.redirect(back, 303);
  }
  return NextResponse.json(body);
}

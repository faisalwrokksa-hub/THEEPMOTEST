import { rejectUnsafeBrowserMutation } from '@/lib/check-browser-mutation';
import { NextRequest, NextResponse } from 'next/server';

const BASE = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const SESSION = 'pmo_session';

/**
 * The assistant panel talks to this and gets JSON back.
 *
 * Separate from the form-POST route rather than shared: that one redirects so
 * the full page keeps working without JavaScript, and a redirect is precisely
 * what a panel that must not navigate away cannot have.
 */
export async function POST(req: NextRequest) {
  const blocked = rejectUnsafeBrowserMutation(req);
  if (blocked) return blocked;
  const token = req.cookies.get(SESSION)?.value;
  if (!token) return NextResponse.json({ error: 'Signed out.' }, { status: 401 });

  const { question, threadId, lang, path } = await req.json().catch(() => ({} as any));
  if (!String(question ?? '').trim()) {
    return NextResponse.json({ error: 'Ask a question.' }, { status: 400 });
  }

  const res = await fetch(`${BASE}/api/v1/ask?lang=${lang === 'ar' ? 'ar' : 'en'}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: `${SESSION}=${token}` },
    body: JSON.stringify({ question, threadId, path }),
    cache: 'no-store',
  }).catch(() => null);

  if (!res) return NextResponse.json({ error: 'Cannot reach the server.' }, { status: 502 });
  const body = await res.json().catch(() => ({} as any));
  if (!res.ok) {
    return NextResponse.json({ error: body?.message ?? `Failed (${res.status}).` }, { status: res.status });
  }
  return NextResponse.json(body);
}

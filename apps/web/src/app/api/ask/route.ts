import { rejectUnsafeBrowserMutation } from '@/lib/check-browser-mutation';
import { NextRequest, NextResponse } from 'next/server';
import { publicUrl } from '@/lib/public-url';

const BASE = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const SESSION = 'pmo_session';

/**
 * Asking is a plain form POST, so the page works without JavaScript and a
 * refresh cannot resubmit the question — the answer lives at a thread URL.
 */
export async function POST(req: NextRequest) {
  const blocked = rejectUnsafeBrowserMutation(req);
  if (blocked) return blocked;
  const token = req.cookies.get(SESSION)?.value;
  if (!token) return NextResponse.redirect(publicUrl(req, '/login'), 303);

  const f = await req.formData();
  const question = String(f.get('question') ?? '').trim();
  const threadId = String(f.get('threadId') ?? '') || undefined;
  const lang = f.get('lang') === 'ar' ? 'ar' : 'en';

  const back = publicUrl(req, '/ask');
  if (!question) {
    back.searchParams.set('error', 'Ask a question.');
    return NextResponse.redirect(back, 303);
  }

  let res: Response;
  try {
    res = await fetch(`${BASE}/api/v1/ask?lang=${lang}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: `${SESSION}=${token}` },
      body: JSON.stringify({ question, threadId }),
      cache: 'no-store',
    });
  } catch {
    back.searchParams.set('error', 'Cannot reach the server.');
    return NextResponse.redirect(back, 303);
  }

  const body = await res.json().catch(() => ({} as any));
  if (!res.ok) {
    back.searchParams.set('error', body?.message ?? `Ask X failed (${res.status}).`);
    if (threadId) back.searchParams.set('thread', threadId);
    return NextResponse.redirect(back, 303);
  }

  back.searchParams.set('thread', body.threadId);
  return NextResponse.redirect(back, 303);
}

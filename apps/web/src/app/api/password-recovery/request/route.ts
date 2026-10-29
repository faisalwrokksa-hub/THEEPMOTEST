import { NextRequest, NextResponse } from 'next/server';
import { rejectUnsafeBrowserMutation } from '@/lib/check-browser-mutation';
const BASE = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
export async function POST(req: NextRequest) {
  const blocked = rejectUnsafeBrowserMutation(req);
  if (blocked) return blocked;
  const data = await req.json().catch(() => null);
  if (typeof data?.email !== 'string' || data.email.length > 254 ||
      !['en', 'ar', undefined].includes(data.lang)) return NextResponse.json({ ok: false }, { status: 400 });
  const result = await fetch(`${BASE}/auth/password-recovery/request`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: data.email, lang: data.lang ?? 'en' }), cache: 'no-store',
  }).catch(() => null);
  if (!result) return NextResponse.json({ ok: false }, { status: 503 });
  return NextResponse.json({ ok: result.ok }, {
    status: result.ok ? 200 : result.status, headers: { 'cache-control': 'no-store' },
  });
}

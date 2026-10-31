import { NextRequest, NextResponse } from 'next/server';
import { rejectUnsafeBrowserMutation } from '@/lib/check-browser-mutation';
import { postRecoveryToApi } from '@/lib/recovery-proxy.mjs';

const BASE = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const NO_STORE = { 'cache-control': 'no-store' };

export async function POST(req: NextRequest) {
  const blocked = rejectUnsafeBrowserMutation(req);
  if (blocked) return blocked;
  const data = await req.json().catch(() => null);
  if (typeof data?.email !== 'string' || data.email.length > 254 ||
      !['en', 'ar', undefined].includes(data.lang))
    return NextResponse.json({ ok: false }, { status: 400, headers: NO_STORE });

  // Do not replay account identifiers to a redirected upstream endpoint.
  const status = await postRecoveryToApi(fetch, `${BASE}/auth/password-recovery/request`, {
    email: data.email, lang: data.lang ?? 'en',
  });
  return NextResponse.json({ ok: status === 200 }, { status, headers: NO_STORE });
}

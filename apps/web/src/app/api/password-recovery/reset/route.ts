import { NextRequest, NextResponse } from 'next/server';
import { rejectUnsafeBrowserMutation } from '@/lib/check-browser-mutation';
import { postRecoveryToApi } from '@/lib/recovery-proxy.mjs';
import { readBoundedBrowserJson } from '@/lib/bounded-browser-json.mjs';

const BASE = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const NO_STORE = { 'cache-control': 'no-store' };

export async function POST(req: NextRequest) {
  const blocked = rejectUnsafeBrowserMutation(req);
  if (blocked) return blocked;
  const parsed = await readBoundedBrowserJson(req);
  if (!parsed.value) return NextResponse.json({ ok: false },
    { status: parsed.error === 'too-large' ? 413 : 400, headers: NO_STORE });
  const data = parsed.value;
  if (typeof data?.token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(data.token) ||
      typeof data.password !== 'string' || data.password.length < 12 || data.password.length > 200)
    return NextResponse.json({ ok: false }, { status: 400, headers: NO_STORE });

  // Never follow a 307/308 with a reset bearer and new password in its POST body.
  const status = await postRecoveryToApi(fetch, `${BASE}/auth/password-recovery/reset`, {
    token: data.token, password: data.password,
  });
  return NextResponse.json({ ok: status === 200 }, { status, headers: NO_STORE });
}

import { NextRequest, NextResponse } from 'next/server';
import { rejectUnsafeBrowserMutation } from '@/lib/check-browser-mutation';
const BASE = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
export async function POST(req: NextRequest) {
  const blocked = rejectUnsafeBrowserMutation(req);
  if (blocked) return blocked;
  const data = await req.json().catch(() => null);
  if (typeof data?.token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(data.token) ||
      typeof data.password !== 'string' || data.password.length < 12 || data.password.length > 200)
    return NextResponse.json({ ok: false }, { status: 400, headers: { 'cache-control': 'no-store' } });
  const result = await fetch(`${BASE}/auth/password-recovery/reset`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token: data.token, password: data.password }), cache: 'no-store',
  }).catch(() => null);
  if (!result) return NextResponse.json({ ok: false }, { status: 503, headers: { 'cache-control': 'no-store' } });
  return NextResponse.json({ ok: result.ok }, { status: result.ok ? 200 : result.status,
    headers: { 'cache-control': 'no-store' } });
}

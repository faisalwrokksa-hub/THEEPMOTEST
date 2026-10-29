import { NextRequest, NextResponse } from 'next/server';
import { publicUrl } from '@/lib/public-url';
import { rejectUnsafeBrowserMutation } from '@/lib/check-browser-mutation';

const BASE = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const COOKIE = 'pmo_session';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Same-site form proxy. Never accept arbitrary return URLs or untrusted Stripe redirects. */
export async function POST(req: NextRequest) {
  const unsafe = rejectUnsafeBrowserMutation(req);
  if (unsafe) return unsafe;
  const token = req.cookies.get(COOKIE)?.value;
  if (!token) return NextResponse.redirect(publicUrl(req, '/login'), 303);
  const form = await req.formData();
  const action = form.get('action');
  const invoiceId = String(form.get('invoiceId') ?? '');
  const target = publicUrl(req, '/billing');
  let path: string;
  let payload: Record<string, unknown>;
  if (action === 'issue-invoice') {
    path = '/api/v1/subscription/billing/renewal-invoice';
    payload = {};
  } else if (action === 'checkout' && UUID.test(invoiceId)) {
    path = '/api/v1/subscription/billing/stripe/checkout';
    payload = { invoiceId };
  } else {
    target.searchParams.set('error', 'Invalid billing request');
    return NextResponse.redirect(target, 303);
  }
  const response = await fetch(`${BASE}${path}`, {
    method: 'POST', cache: 'no-store',
    headers: { 'content-type': 'application/json', cookie: `${COOKIE}=${token}` },
    body: JSON.stringify(payload),
  }).catch(() => null);
  if (!response?.ok) {
    const error = await response?.json().catch(() => null);
    target.searchParams.set('error', typeof error?.message === 'string' ? error.message.slice(0, 160) : 'Billing service unavailable');
    return NextResponse.redirect(target, 303);
  }
  if (action === 'issue-invoice') {
    target.searchParams.set('success', '1');
    return NextResponse.redirect(target, 303);
  }
  const data = await response.json().catch(() => null);
  try {
    const url = new URL(data?.url);
    if (url.protocol !== 'https:' || url.hostname !== 'checkout.stripe.com') throw new Error('Unsafe checkout URL');
    return NextResponse.redirect(url, 303);
  } catch {
    target.searchParams.set('error', 'Invalid payment-provider redirect');
    return NextResponse.redirect(target, 303);
  }
}

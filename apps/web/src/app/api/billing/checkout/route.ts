import { NextRequest, NextResponse } from 'next/server';
import { publicUrl } from '@/lib/public-url';
import { rejectUnsafeBrowserMutation } from '@/lib/check-browser-mutation';
import { stripeCheckoutRedirect } from '@/lib/billing-checkout-redirect';

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
    method: 'POST', cache: 'no-store', redirect: 'error',
    headers: { 'content-type': 'application/json', cookie: `${COOKIE}=${token}` },
    body: JSON.stringify(payload),
  }).catch(() => null);
  // A credentialed API request must never follow an upstream redirect, and
  // untrusted API diagnostics must never be reflected into a customer URL.
  if (!response || response.redirected || (response.status >= 300 && response.status < 400) || !response.ok) {
    target.searchParams.set('error', 'Billing service unavailable');
    return NextResponse.redirect(target, 303);
  }
  if (action === 'issue-invoice') {
    target.searchParams.set('success', '1');
    return NextResponse.redirect(target, 303);
  }
  const data = await response.json().catch(() => null);
  const url = stripeCheckoutRedirect(data, invoiceId);
  if (!url) {
    target.searchParams.set('error', 'Invalid payment-provider redirect');
    return NextResponse.redirect(target, 303);
  }
  return NextResponse.redirect(url, 303);
}

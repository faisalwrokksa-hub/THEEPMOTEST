import { NextRequest, NextResponse } from 'next/server';
import { publicUrl } from '@/lib/public-url';
import { rejectUnsafeBrowserMutation } from '@/lib/check-browser-mutation';

const BASE = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const SESSION = 'pmo_session';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const code = /^[a-z][a-z0-9_-]{2,39}$/;

// Browser form actions are allowlisted. Never forward arbitrary tenant IDs or API paths.
export async function POST(req: NextRequest) {
  const unsafe = rejectUnsafeBrowserMutation(req);
  if (unsafe) return unsafe;
  const token = req.cookies.get(SESSION)?.value;
  if (!token) return NextResponse.redirect(publicUrl(req, '/login'), 303);
  const form = await req.formData();
  const get = (key: string) => String(form.get(key) ?? '');
  const action = get('action');
  const tenantId = get('tenantId');
  const subscriptionId = get('subscriptionId');
  const plan = get('code');
  let url = '';
  let method: 'POST'|'PATCH' = 'POST';
  let body: Record<string, unknown>;
  if (action === 'create-plan') {
    url = '/api/v1/super-admin/plans';
    body = {
      code: plan, name: get('name'), priceMinor: Number(get('priceMinor')),
      currency: get('currency'), billingInterval: get('billingInterval'),
      trialDays: Number(get('trialDays')), isActive: true,
    };
  } else if (action === 'update-plan' && code.test(plan)) {
    url = `/api/v1/super-admin/plans/${plan}`;
    method = 'PATCH';
    body = { isActive: get('isActive') === 'true' };
  } else if (action === 'manual-grant' && uuid.test(tenantId)) {
    url = `/api/v1/super-admin/tenants/${tenantId}/subscriptions`;
    const toISO = (s: string) => s ? new Date(`${s}Z`).toISOString() : undefined;
    try {
      body = {
        planCode: get('planCode'), status: get('status'),
        periodStartsAt: toISO(get('periodStartsAt')),
        periodEndsAt: toISO(get('periodEndsAt')),
        ...(get('trialEndsAt') ? {trialEndsAt: toISO(get('trialEndsAt'))} : {}),
        reason: get('reason'),
      };
    } catch { return NextResponse.redirect(publicUrl(req, '/super-admin?error=Invalid%20date'), 303); }
  } else if (action === 'cancel' && uuid.test(tenantId) && uuid.test(subscriptionId)) {
    url = `/api/v1/super-admin/tenants/${tenantId}/subscriptions/${subscriptionId}/cancel`;
    body = { reason: get('reason') };
  } else {
    return NextResponse.redirect(publicUrl(req, '/super-admin?error=Invalid%20operation'), 303);
  }
  const response = await fetch(`${BASE}${url}`, {
    method, cache: 'no-store',
    headers: { 'content-type': 'application/json', cookie: `${SESSION}=${token}` },
    body: JSON.stringify(body),
  }).catch(() => null);
  const target = publicUrl(req, '/super-admin');
  if (!response?.ok) {
    const failure = await response?.json().catch(() => null);
    const message = typeof failure?.message === 'string' ? failure.message : `Request failed (${response?.status ?? 'network'})`;
    target.searchParams.set('error', message.slice(0, 180));
  } else target.searchParams.set('done', '1');
  return NextResponse.redirect(target, 303);
}

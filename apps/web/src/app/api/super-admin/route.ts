import { NextRequest, NextResponse } from 'next/server';
import { publicUrl } from '@/lib/public-url';
import { rejectUnsafeBrowserMutation } from '@/lib/check-browser-mutation';
import { readBoundedBrowserForm } from '@/lib/bounded-browser-form.mjs';
import { fetchTenantMutation } from '@/lib/tenant-mutation-fetch.mjs';
import { safeMutationError } from '@/lib/safe-mutation-feedback.mjs';

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
  // Fully bound the browser body before any privileged subscription mutation.
  const parsed = await readBoundedBrowserForm(req);
  if (!parsed.form) return NextResponse.json({
    error: parsed.error === 'too-large'
      ? 'Form submission exceeds the size limit.' : 'Invalid form submission.',
  }, { status: parsed.error === 'too-large' ? 413 : 400 });
  const form = parsed.form;
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
  // Never forward a privileged cookie or subscription mutation to an
  // upstream redirect; do not retry ambiguous network failures.
  const response = await fetchTenantMutation(fetch, `${BASE}${url}`, {
    method, cache: 'no-store',
    headers: { 'content-type': 'application/json', cookie: `${SESSION}=${token}` },
    body: JSON.stringify(body),
  });
  const target = publicUrl(req, '/super-admin');
  // Upstream bodies may contain SQL diagnostics, secrets or attacker-controlled
  // messages. Only fixed classifications are safe in browser redirect URLs.
  if (!response?.ok) target.searchParams.set('error', safeMutationError(response?.status ?? 503));
  else target.searchParams.set('done', '1');
  return NextResponse.redirect(target, 303);
}

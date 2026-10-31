import { NextRequest, NextResponse } from 'next/server';
import { publicUrl } from '@/lib/public-url';
import { rejectUnsafeBrowserMutation } from '@/lib/check-browser-mutation';
import { fetchTenantMutation } from '@/lib/tenant-mutation-fetch.mjs';
import { onboardingFailurePath } from '@/lib/onboarding-failure-feedback.mjs';
import { readBoundedBrowserForm } from '@/lib/bounded-browser-form.mjs';

const BASE = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const roles = new Set(['client_admin','pmo_lead','portfolio_manager','program_manager',
  'project_manager','governance_risk','finance_benefits','staff_consultant',
  'external_professional','team_member','executive_viewer','restricted_viewer']);

/** Fixed route allowlist. Tenant scope always comes from the server-side session. */
export async function POST(req: NextRequest) {
  const unsafe = rejectUnsafeBrowserMutation(req);
  if (unsafe) return unsafe;
  const session = req.cookies.get('pmo_session')?.value;
  if (!session) return NextResponse.redirect(publicUrl(req, onboardingFailurePath(401)), 303);
  const parsed = await readBoundedBrowserForm(req);
  if (!parsed.form) return NextResponse.json({
    error: parsed.error === 'too-large'
      ? 'Form submission exceeds the size limit.' : 'Invalid form submission.',
  }, { status: parsed.error === 'too-large' ? 413 : 400 });
  const form = parsed.form;
  const get = (key: string) => String(form.get(key) ?? '').trim();
  const action = get('action');
  const target = publicUrl(req, '/settings');
  let path: string;
  let method: 'POST' | 'PATCH' = 'POST';
  let body: Record<string, unknown> = {};
  if (action === 'profile') {
    path = '/api/v1/onboarding/profile';
    method = 'PATCH';
    body = { displayName: get('displayName'), nameAr: get('nameAr') || null,
      contactEmail: get('contactEmail') || null };
  } else if (action === 'invite' && roles.has(get('role'))) {
    path = '/api/v1/onboarding/invitations';
    body = { email: get('email'), role: get('role'), lang: get('lang') === 'ar' ? 'ar' : 'en' };
  } else if (action === 'revoke' && uuid.test(get('id'))) {
    path = `/api/v1/onboarding/invitations/${get('id')}/revoke`;
  } else {
    return NextResponse.redirect(publicUrl(req, onboardingFailurePath(400)), 303);
  }
  const result = await fetchTenantMutation(fetch, `${BASE}${path}`, {
    method, cache: 'no-store',
    headers: { 'content-type': 'application/json', cookie: `pmo_session=${session}` },
    body: JSON.stringify(body),
  });
  if (!result?.ok) {
    // A 401 must return to login, a 403 must explain denied access, and an
    // ambiguous timeout must not claim that an invitation was sent.
    return NextResponse.redirect(publicUrl(req, onboardingFailurePath(result?.status)), 303);
  }
  target.searchParams.set('done', action);
  return NextResponse.redirect(target, 303);
}

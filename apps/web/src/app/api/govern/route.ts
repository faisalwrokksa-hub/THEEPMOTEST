import { safeReturnPath } from '@/lib/browser-mutation';
import { rejectUnsafeBrowserMutation } from '@/lib/check-browser-mutation';
import { NextRequest, NextResponse } from 'next/server';
import { publicUrl } from '@/lib/public-url';

const BASE = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const SESSION = 'pmo_session';

/**
 * All governance writes go through one form-POST handler.
 *
 * Plain forms (not Server Actions) so every control keeps working when the
 * client bundle fails and nothing can go stale after a redeploy. The `intent`
 * field says which operation; the API re-checks permission and the gate rule
 * regardless of what arrives here.
 */
export async function POST(req: NextRequest) {
  const blocked = rejectUnsafeBrowserMutation(req);
  if (blocked) return blocked;
  const token = req.cookies.get(SESSION)?.value;
  if (!token) return NextResponse.redirect(publicUrl(req, '/login'), 303);

  const f = await req.formData();
  const intent = String(f.get('intent') ?? '');
  const back = String(f.get('returnTo') ?? '/governance');

  const call = async (path: string, method: string, body?: unknown) => {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: { 'content-type': 'application/json', cookie: `${SESSION}=${token}` },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: 'no-store',
    });
    if (res.ok) return null;
    const j = await res.json().catch(() => ({} as any));
    const reasons = Array.isArray(j?.blockers) ? j.blockers.map((b: any) => b.message).join(' · ') : '';
    return [j?.message, reasons].filter(Boolean).join(' — ') || `Request failed (${res.status})`;
  };

  let error: string | null = null;
  switch (intent) {
    case 'criterion': {
      const id = String(f.get('id'));
      const isMet = String(f.get('isMet')) === 'true';
      const evidenceUrl = String(f.get('evidenceUrl') ?? '').trim() || undefined;
      error = await call(`/api/v1/gate-criteria/${id}`, 'PATCH', { isMet, evidenceUrl });
      break;
    }
    case 'decide':
      error = await call(`/api/v1/approvals/${String(f.get('id'))}/decision`, 'POST', {
        decision: String(f.get('decision')),
        comment: String(f.get('comment') ?? '').trim() || undefined,
      });
      break;
    case 'advance':
      error = await call(`/api/v1/gates/${String(f.get('id'))}/advance`, 'POST');
      break;
    case 'assign':
      error = await call(`/api/v1/gates/${String(f.get('id'))}/approvers`, 'POST', {
        userId: String(f.get('userId')), accountable: true,
      });
      break;
    case 'addCriterion':
      error = await call(`/api/v1/gates/${String(f.get('id'))}/criteria`, 'POST', {
        label: String(f.get('label') ?? '').trim(),
      });
      break;
    case 'raid':
      error = await call(`/api/v1/raid/${String(f.get('id'))}`, 'PATCH', {
        status: String(f.get('status')),
      });
      break;
    case 'task':
      error = await call(`/api/v1/tasks/${String(f.get('id'))}`, 'PATCH', {
        state: String(f.get('state')),
      });
      break;
    default:
      error = 'Unknown action';
  }

  const url = publicUrl(req, safeReturnPath(back, '/governance'));
  if (error) url.searchParams.set('error', error);
  else url.searchParams.set('done', intent);
  return NextResponse.redirect(url, 303);
}

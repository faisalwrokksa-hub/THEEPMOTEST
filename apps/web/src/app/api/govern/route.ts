import { safeReturnPath } from '@/lib/browser-mutation';
import { rejectUnsafeBrowserMutation } from '@/lib/check-browser-mutation';
import { NextRequest, NextResponse } from 'next/server';
import { publicUrl } from '@/lib/public-url';
import { readBoundedBrowserForm } from '@/lib/bounded-browser-form.mjs';
import { fetchTenantMutation } from '@/lib/tenant-mutation-fetch.mjs';
import { safeMutationError } from '@/lib/safe-mutation-feedback.mjs';
import { uuidPathSegment } from '@/lib/uuid-path.mjs';

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

  // A form must be fully received within the byte ceiling before any write.
  const parsed = await readBoundedBrowserForm(req);
  if (!parsed.form) return NextResponse.json({
    error: parsed.error === 'too-large'
      ? 'Form submission exceeds the size limit.' : 'Invalid form submission.',
  }, { status: parsed.error === 'too-large' ? 413 : 400 });
  const f = parsed.form;
  const intent = String(f.get('intent') ?? '');
  const back = String(f.get('returnTo') ?? '/governance');

  // Every governance operation targets a UUID resource. Do not allow a form
  // field to select an arbitrary authenticated API path through traversal.
  let id: string | null = null;
  try { id = uuidPathSegment(f.get('id')); } catch { /* invalid form ID */ }

  const call = async (path: string, method: string, body?: unknown) => {
    const res = await fetchTenantMutation(fetch, `${BASE}${path}`, {
      method,
      headers: { 'content-type': 'application/json', cookie: `${SESSION}=${token}` },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: 'no-store',
    });
    // Never reflect upstream SQL errors, blocker messages or exception text
    // into redirect query parameters. A rejected redirect is not retried.
    return res?.ok ? null : safeMutationError(res?.status ?? 503);
  };

  let error: string | null = null;
  if (!id) error = 'Invalid resource identifier';
  else switch (intent) {
    case 'criterion': {
      const isMet = String(f.get('isMet')) === 'true';
      const evidenceUrl = String(f.get('evidenceUrl') ?? '').trim() || undefined;
      error = await call(`/api/v1/gate-criteria/${id}`, 'PATCH', { isMet, evidenceUrl });
      break;
    }
    case 'decide':
      error = await call(`/api/v1/approvals/${id}/decision`, 'POST', {
        decision: String(f.get('decision')),
        comment: String(f.get('comment') ?? '').trim() || undefined,
      });
      break;
    case 'advance':
      error = await call(`/api/v1/gates/${id}/advance`, 'POST');
      break;
    case 'assign':
      error = await call(`/api/v1/gates/${id}/approvers`, 'POST', {
        userId: String(f.get('userId')), accountable: true,
      });
      break;
    case 'addCriterion':
      error = await call(`/api/v1/gates/${id}/criteria`, 'POST', {
        label: String(f.get('label') ?? '').trim(),
      });
      break;
    case 'raid':
      error = await call(`/api/v1/raid/${id}`, 'PATCH', {
        status: String(f.get('status')),
      });
      break;
    case 'task':
      error = await call(`/api/v1/tasks/${id}`, 'PATCH', {
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

import { safeReturnPath } from '@/lib/browser-mutation';
import { rejectUnsafeBrowserMutation } from '@/lib/check-browser-mutation';
import { fetchTenantMutation } from '@/lib/tenant-mutation-fetch.mjs';
import { NextRequest, NextResponse } from 'next/server';
import { publicUrl } from '@/lib/public-url';

const BASE = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const SESSION = 'pmo_session';

/** One form-POST handler for every "create" form. `kind` picks the endpoint. */
export async function POST(req: NextRequest) {
  const blocked = rejectUnsafeBrowserMutation(req);
  if (blocked) return blocked;
  // The form asks for JSON when JavaScript is driving the submit, so a refusal
  // can be drawn beside the fields instead of replacing the page and throwing
  // away everything typed into it. Without JavaScript this stays a 303.
  const wantsJson = (req.headers.get('accept') ?? '').includes('application/json');

  const token = req.cookies.get(SESSION)?.value;
  if (!token) {
    const login = publicUrl(req, '/login').toString();
    return wantsJson
      ? NextResponse.json({ error: 'Your session has expired. Sign in again.', redirect: login }, { status: 401 })
      : NextResponse.redirect(login, 303);
  }

  const f = await req.formData();
  // `__`-prefixed fields route the request; everything else is the record.
  // They were once called `kind` and `returnTo`, which meant any record with a
  // `kind` of its own — RAID items, cost lines, documents, updates — had that
  // value stripped before it ever reached the API.
  const kind = String(f.get('__kind') ?? '');
  const back = String(f.get('__returnTo') ?? '/');

  const body: Record<string, unknown> = {};
  for (const [k, v] of f.entries()) {
    if (k.startsWith('__')) continue;
    const s = String(v);
    if (s !== '') body[k] = s;
  }
  // Unchecked boxes are simply absent from a form post.
  if (kind === 'project') body.withGates = f.get('withGates') === 'on';
  if (kind === 'raid') body.blocksActiveGate = f.get('blocksActiveGate') === 'on';

  // A temporarily unreachable API should be a recoverable form error,
  // never an unhandled Next.js exception that loses the user's typed values.
  let res: Response;
  try {
    res = await fetchTenantMutation(fetch, `${BASE}/api/v1/create/${kind}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: `${SESSION}=${token}` },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    if (!res) throw new Error('Unconfirmed upstream mutation response');
  } catch {
    const message = 'The service is temporarily unavailable. Please retry shortly.';
    if (wantsJson) return NextResponse.json({ error: message, issues: [] },
      { status: 503, headers: { 'Retry-After': '5' } });
    const backUrl = publicUrl(req, safeReturnPath(back, '/'));
    backUrl.searchParams.set('error', message);
    return NextResponse.redirect(backUrl, 303);
  }

  let url = publicUrl(req, safeReturnPath(back, '/'));
  if (!res.ok) {
    const j = await res.json().catch(() => ({}) as any);
    const issues = Array.isArray(j?.issues)
      ? j.issues.map((i: any) => `${i.path}: ${i.message}`).join('; ') : '';
    const message = [j?.message, issues].filter(Boolean).join(' — ') || `Failed (${res.status})`;
    if (wantsJson) return NextResponse.json({ error: message, issues: Array.isArray(j?.issues) ? j.issues : [] }, { status: res.status });
    url.searchParams.set('error', message);
  } else {
    // A newly created project already has its first governance gate. Take the
    // customer straight there instead of leaving them hunting through a list.
    if (kind === 'project') {
      const created = await res.json().catch(() => ({}));
      if (typeof created?.id === 'string' &&
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(created.id)) {
        url = publicUrl(req, `/governance/${created.id}`);
      }
    }
    url.searchParams.set('done', kind);
    if (wantsJson) return NextResponse.json({ ok: true, redirect: url.toString() });
  }
  return NextResponse.redirect(url, 303);
}

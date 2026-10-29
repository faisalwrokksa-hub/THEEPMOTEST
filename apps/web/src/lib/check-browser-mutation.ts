import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { isTrustedBrowserMutation } from './browser-mutation';

/**
 * Apply before reading form data, forwarding credentials, or mutating a session.
 * WEB_ORIGIN is supplied to BOTH API and web services in production.
 * In development, the local Next.js origin is sufficient as a default.
 */
export function rejectUnsafeBrowserMutation(req: NextRequest): NextResponse | null {
  const origins = process.env.WEB_ORIGIN
    ? process.env.WEB_ORIGIN.split(',').map((o) => o.trim()).filter(Boolean)
    : process.env.NODE_ENV === 'production' ? [] : [req.nextUrl.origin];

  if (isTrustedBrowserMutation(
    req.headers.get('origin'), req.headers.get('sec-fetch-site'), origins,
  )) return null;
  return NextResponse.json({ error: 'Untrusted request origin.' }, { status: 403 });
}

import { NextRequest, NextResponse } from 'next/server';
import { publicUrl } from '@/lib/public-url';

const BASE = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

/**
 * Where Microsoft sends the browser back to.
 *
 * It lands on the web app rather than the API because the API is not on the
 * public internet — nginx proxies one location, `/`, to the web container, and
 * nothing to the API. A redirect URI pointing at the API would be registered in
 * Entra ID, accepted by Microsoft, and then quietly 404 in the one browser that
 * mattered. This forwards the code to the API over the compose network and
 * sends the browser wherever the API says.
 *
 * No session is involved, by design: the request is coming from Microsoft. The
 * `state` is what authenticates it, and the API checks that it issued it, that
 * it has not expired, and that it has not been used before.
 */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const back = (error: string) => {
    const u = publicUrl(req, '/integrations');
    u.searchParams.set('error', error);
    return NextResponse.redirect(u, 303);
  };

  let res: Response;
  try {
    const target = new URL('/integrations/microsoft/callback', BASE);
    for (const k of ['code', 'state', 'error', 'error_description']) {
      const v = q.get(k);
      if (v) target.searchParams.set(k, v);
    }
    res = await fetch(target, { redirect: 'manual', cache: 'no-store' });
  } catch {
    return back('Cannot reach the server to finish connecting.');
  }

  // The API answers with the redirect it wants the browser to follow, built
  // against WEB_ORIGIN — so it is already an address on this site.
  const location = res.headers.get('location');
  if (!location) return back('The connection could not be completed.');
  return NextResponse.redirect(location, 303);
}

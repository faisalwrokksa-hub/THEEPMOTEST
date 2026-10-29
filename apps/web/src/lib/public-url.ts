import type { NextRequest } from 'next/server';

/**
 * Canonical external redirect URLs. In production, the origin MUST come from
 * a configured allowlist, not an untrusted Host / X-Forwarded-Host header.
 * For multiple approved browser origins, use the matching origin if present;
 * otherwise default to the first configured origin.
 */
export function publicUrl(req: NextRequest, path: string): URL {
  const configured = (process.env.WEB_ORIGIN ?? '')
    .split(',').map((o) => o.trim()).filter(Boolean);
  if (configured.length) {
    const forwardedHost = req.headers.get('x-forwarded-host');
    const host = forwardedHost ?? req.headers.get('host');
    const protocol = req.headers.get('x-forwarded-proto')
      ?? (process.env.NODE_ENV === 'production' ? 'https' : 'http');
    const candidate = host && (protocol === 'https' || protocol === 'http')
      ? `${protocol}://${host}` : '';
    const origin = configured.includes(candidate) ? candidate : configured[0];
    return new URL(path, origin);
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('WEB_ORIGIN must be configured for safe production redirects');
  }
  return new URL(path, req.nextUrl.origin);
}

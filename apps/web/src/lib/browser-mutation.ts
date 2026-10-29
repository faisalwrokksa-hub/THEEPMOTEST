/**
 * Browser-origin check for Next.js route handlers which forward session cookies
 * to the API. Protect the *web* boundary as well as the downstream API: a
 * cross-site form submit would otherwise be converted to an origin-less,
 * server-to-server request that the API intentionally accepts.
 */
export function isTrustedBrowserMutation(
  origin: string | null,
  fetchSite: string | null,
  allowedOrigins: readonly string[],
): boolean {
  if (allowedOrigins.length === 0 || fetchSite === 'cross-site') return false;
  // Only explicitly configured origins are trusted, never a same-site sibling
  // subdomain or the literal Origin "null".
  if (origin !== null) return allowedOrigins.includes(origin);
  // Modern browsers attach Fetch Metadata even when Origin is unavailable.
  // Do not allow unlabelled browser writes merely because the API proxy does.
  return fetchSite === 'same-origin';
}

/** A returnTo value is always a local path, never a protocol-relative URL. */
export function safeReturnPath(value: string, fallback = '/'): string {
  if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return fallback;
  try {
    const root = new URL('https://return-path.invalid');
    const parsed = new URL(value, root);
    if (parsed.origin !== root.origin || !parsed.pathname.startsWith('/')) return fallback;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}

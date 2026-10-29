/**
 * Browser request provenance for cookie-authenticated state changes.
 * CORS controls whether browser JS can read responses; it is not a CSRF guard.
 * Server-side Next.js proxy calls omit Origin and Sec-Fetch-Site, so retain them.
 */
export function isAllowedWriteRequest(
  method: string,
  origin: string | undefined,
  fetchSite: string | undefined,
  allowedOrigins: readonly string[],
): boolean {
  if (['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase())) return true;
  // Explicitly cross-site browser requests must never execute writes.
  if (fetchSite === 'cross-site') return false;
  // Internal service-to-service calls carry neither provenance header. A
  // browser request claiming a sibling-site/unknown context but omitting
  // Origin must not receive the internal-call exception.
  if (origin === undefined && fetchSite !== undefined && fetchSite !== 'same-origin') return false;
  // An Origin (including "null") must match the explicit CORS allowlist.
  if (origin !== undefined && !allowedOrigins.includes(origin)) return false;
  return true;
}

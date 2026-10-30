/** Restrict delegated Microsoft bearer tokens to their intended API resource. */
const ALLOWED = new Set([
  'https://graph.microsoft.com/v1.0',
  'https://api.powerbi.com/v1.0/myorg',
]);

/**
 * Internal calls use /me, /sites etc; @odata.nextLink may be an absolute URL.
 * Neither form may escape the configured Microsoft API origin and version path.
 */
export function microsoftApiUrl(base: string, path: string): string {
  if (!ALLOWED.has(base)) throw new Error('Unrecognized Microsoft API resource.');
  if (typeof path !== 'string' || !path || path.startsWith('//') ||
      path.includes('\\') || path.includes('#')) {
    throw new Error('Unsafe Microsoft API path.');
  }
  const resource = new URL(base);
  const url = path.startsWith('/') ? new URL(base + path) : new URL(path);
  if (url.protocol !== 'https:' || url.origin !== resource.origin ||
      url.username || url.password || url.hash ||
      (url.pathname !== resource.pathname &&
       !url.pathname.startsWith(resource.pathname + '/'))) {
    throw new Error('Microsoft API continuation left its authorized resource.');
  }
  return url.toString();
}

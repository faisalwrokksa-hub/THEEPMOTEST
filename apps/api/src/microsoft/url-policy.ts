/**
 * A delegated Microsoft bearer token must never accompany a request to a
 * host supplied by an API response, user input, or a redirect.
 * OData nextLink URLs are absolute; accept only the exact service API origin
 * and versioned path belonging to the requested resource.
 */
export function microsoftApiUrl(base: string, path: string): string {
  const service = new URL(base);
  if (service.protocol !== 'https:' || service.username || service.password ||
      service.search || service.hash || service.port) {
    throw new Error('Invalid Microsoft API service configuration');
  }
  if (typeof path !== 'string' || !path ||
      /[\\\u0000-\u001f\u007f]/.test(path) ||
      (!path.startsWith('/') && !path.startsWith('https://')) ||
      path.startsWith('//')) {
    throw new Error('Unsafe Microsoft API URL');
  }
  let target: URL;
  try {
    target = path.startsWith('https://') ? new URL(path) : new URL(service.pathname.replace(/\/$/, '') + path, service.origin);
  } catch {
    throw new Error('Unsafe Microsoft API URL');
  }
  const prefix = service.pathname.replace(/\/$/, '');
  if (target.protocol !== 'https:' || target.origin !== service.origin ||
      target.username || target.password || target.hash ||
      !(target.pathname === prefix || target.pathname.startsWith(prefix + '/'))) {
    throw new Error('Microsoft API URL outside approved resource');
  }
  return target.toString();
}

/**
 * Upload-session URLs come from Graph but carry customer file bytes, not a
 * bearer token. Accept only Microsoft-hosted HTTPS upload endpoints; never
 * allow private hosts, arbitrary redirects, credentials or custom ports.
 * The query string is an opaque, short-lived Microsoft upload capability.
 */
export function microsoftUploadUrl(value: unknown): string {
  if (typeof value !== 'string' || !value.startsWith('https://') ||
      /[\\\\\u0000-\u001f\u007f]/.test(value)) {
    throw new Error('Unsafe Microsoft upload session URL');
  }
  let url: URL;
  try { url = new URL(value); } catch { throw new Error('Unsafe Microsoft upload session URL'); }
  const host = url.hostname.toLowerCase();
  const trusted = (host.endsWith('.sharepoint.com') ||
    host.endsWith('.sharepoint-df.com') || host.endsWith('.up.1drv.com')) &&
    host.split('.').length >= 3;
  if (!trusted || url.protocol !== 'https:' || url.port || url.username ||
      url.password || url.hash || !url.pathname.startsWith('/')) {
    throw new Error('Unsafe Microsoft upload session URL');
  }
  return url.toString();
}

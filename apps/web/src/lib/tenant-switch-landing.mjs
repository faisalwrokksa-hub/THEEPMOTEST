/**
 * A workspace change invalidates tenant-scoped entity IDs and filters.
 * Return only to shared index screens; never replay a deep link, query or
 * hash from the previous workspace into the newly selected workspace.
 */
const SHARED_ROUTES = new Set([
  '/', '/getting-started', '/projects', '/programs', '/portfolios',
  '/settings', '/billing', '/reports', '/analytics', '/my-work',
]);

export function tenantSwitchLandingPath(value) {
  if (typeof value !== 'string' || !value.startsWith('/') ||
      value.startsWith('//') || value.includes('\\') ||
      /[\u0000-\u001f\u007f]/.test(value)) return '/';
  const pathname = value.split(/[?#]/, 1)[0];
  return SHARED_ROUTES.has(pathname) ? pathname : '/';
}

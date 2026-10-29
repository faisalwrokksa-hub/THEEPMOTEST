/** OAuth callbacks may not redirect to another origin or to arbitrary paths.
 * Only the integration settings page is a valid post-consent destination. */
export function safeMicrosoftReturnPath(value: unknown): string {
  if (typeof value !== 'string' || value.length > 512 ||
      /[\\\x00-\x1f\x7f]/.test(value) ||
      !/^\/integrations(?:[?#]|$)/.test(value)) return '/integrations';
  try {
    // A fixed origin makes protocol-relative URLs and malformed values visible.
    const url = new URL(value, 'https://epmo.invalid');
    if (url.origin !== 'https://epmo.invalid' || url.pathname !== '/integrations')
      return '/integrations';
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return '/integrations';
  }
}

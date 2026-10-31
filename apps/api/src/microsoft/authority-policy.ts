/**
 * The token exchange sends MS_CLIENT_SECRET to the configured authority.
 * An arbitrary MS_AUTHORITY host is therefore a credential-exfiltration path,
 * even if the authorization redirect itself appears to work.
 *
 * This deployment uses the Microsoft commercial cloud. Do not accept a
 * custom origin, port, credentials, query, fragment, or path traversal.
 * Sovereign clouds require an explicitly reviewed provider configuration,
 * not a silently configurable token destination.
 */
export function microsoftAuthority(configured: string | undefined): string {
  const authority = configured === undefined
    ? 'https://login.microsoftonline.com/organizations'
    : configured;
  const match = /^https:\/\/login\.microsoftonline\.com\/([a-z0-9.-]+)\/?$/i.exec(authority);
  if (!match) throw new Error('Unsafe Microsoft OAuth authority configuration');

  const tenant = match[1];
  if (tenant.length > 253 || !/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/i.test(tenant)) {
    throw new Error('Unsafe Microsoft OAuth authority configuration');
  }
  return `https://login.microsoftonline.com/${tenant}`;
}

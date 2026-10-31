/**
 * Send tenant-authenticated API reads without following upstream redirects.
 * These requests explicitly carry an HttpOnly session cookie as a Cookie header.
 * Do not permit an upstream 30x to replay it to another destination.
 *
 * @param {typeof fetch} fetcher
 * @param {string} endpoint
 * @param {Record<string, string>} headers
 * @returns {Promise<Response>}
 */
export async function fetchAuthenticatedApi(fetcher, endpoint, headers) {
  const response = await fetcher(endpoint, {
    headers,
    cache: 'no-store',
    redirect: 'error',
  });
  if (!response || typeof response.ok !== 'boolean' ||
      !Number.isInteger(response.status) ||
      response.status < 200 || response.status > 599 ||
      (response.status >= 300 && response.status < 400)) {
    throw new Error('Invalid authenticated API response');
  }
  return response;
}

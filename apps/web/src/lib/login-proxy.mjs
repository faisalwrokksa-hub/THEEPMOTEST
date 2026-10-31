/**
 * Authenticate against the configured API without following HTTP redirects.
 * A 307/308 could otherwise replay the user's identifier and password to a
 * redirected destination. The caller handles the response and sets its own
 * HttpOnly session cookie; never forward an upstream Location header.
 *
 * @param {typeof fetch} fetcher
 * @param {string} endpoint
 * @param {{ identifier: string, password: string }} credentials
 * @returns {Promise<Response | null>}
 */
export async function postLoginToApi(fetcher, endpoint, credentials) {
  try {
    const response = await fetcher(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(credentials),
      cache: 'no-store',
      redirect: 'error',
      // Bound stalled authentication requests; never retry or replay credentials.
      signal: AbortSignal.timeout(15_000),
    });
    if (!response || typeof response.ok !== 'boolean' ||
        !Number.isInteger(response.status) ||
        response.status < 200 || response.status > 599 ||
        (response.status >= 300 && response.status < 400)) return null;
    return response;
  } catch {
    // Includes network failures and redirects rejected by the Fetch API.
    return null;
  }
}

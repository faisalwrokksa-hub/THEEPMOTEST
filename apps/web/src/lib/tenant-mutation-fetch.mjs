/**
 * Forward tenant-authenticated browser mutations to the trusted API without
 * following upstream redirects. POST/PATCH bodies and the explicit session
 * Cookie header must never be replayed to a redirected destination.
 *
 * @param {typeof fetch} fetcher
 * @param {string} endpoint
 * @param {RequestInit} init
 * @returns {Promise<Response | null>}
 */
export async function fetchTenantMutation(fetcher, endpoint, init) {
  try {
    const response = await fetcher(endpoint, {
      ...init,
      cache: 'no-store',
      redirect: 'error',
    });
    if (!response || typeof response.ok !== 'boolean' ||
        !Number.isInteger(response.status) ||
        response.status < 200 || response.status > 599 ||
        (response.status >= 300 && response.status < 400)) return null;
    return response;
  } catch {
    // Includes redirects rejected by Fetch, network failures and TLS errors.
    // Never retry a mutation: the original request may already have committed.
    return null;
  }
}

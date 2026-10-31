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
    // Preserve caller cancellation and add an independent deadline. A timeout
    // is an unknown mutation outcome, never a reason to replay the request.
    const deadline = AbortSignal.timeout(15_000);
    const signal = init.signal ? AbortSignal.any([init.signal, deadline]) : deadline;
    const response = await fetcher(endpoint, {
      ...init,
      cache: 'no-store',
      redirect: 'error',
      signal,
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

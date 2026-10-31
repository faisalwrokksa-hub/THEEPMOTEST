/**
 * Forward a password-recovery mutation without following upstream redirects.
 * A 307/308 can otherwise replay the POST body (including a reset bearer token
 * and new password) to an untrusted Location. Return status only: never expose
 * upstream response bodies or headers to the browser.
 *
 * @param {typeof fetch} fetcher
 * @param {string} endpoint
 * @param {Record<string, unknown>} payload
 * @returns {Promise<number>} safe HTTP status for the browser
 */
export async function postRecoveryToApi(fetcher, endpoint, payload) {
  try {
    const response = await fetcher(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      cache: 'no-store',
      redirect: 'error',
    });
    if (response.ok) return 200;
    // A redirect or malformed upstream status is never forwarded to clients.
    return response.status >= 400 && response.status <= 599 ? response.status : 502;
  } catch {
    // Network failure, rejected redirect, or invalid upstream response.
    return 503;
  }
}

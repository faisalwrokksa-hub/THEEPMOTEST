/**
 * A successful HTTP response is not proof that a record was created.
 * The create route returns an explicit JSON acknowledgement and redirect.
 * In particular, reject HTML error pages that a proxy may return with 200.
 */
export function isCreateSuccess(status, payload) {
  return Number.isInteger(status) && status >= 200 && status < 300 &&
    payload !== null && typeof payload === 'object' &&
    payload.ok === true && typeof payload.redirect === 'string' &&
    payload.redirect.trim().length > 0;
}

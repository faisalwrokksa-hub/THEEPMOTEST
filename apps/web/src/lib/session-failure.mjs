/**
 * A failed session lookup is not necessarily an expired session.
 * Treat only explicit authentication refusals as signed out; transient
 * API/network failures must not send an existing user to the login form.
 */
export function sessionFailureKind(status) {
  return status === 401 || status === 403 ? 'signed-out' : 'unavailable';
}

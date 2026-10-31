/**
 * Convert authenticated upstream API errors to a bounded, customer-safe
 * exception. Never put arbitrary upstream text into an Error or its detail.
 * Only fixed license states are retained for existing module-lock UX.
 */
export function safeApiFailure(status, body = '') {
  const code = Number.isInteger(status) && status >= 400 && status <= 599 ? status : 503;
  let detail = '';
  if (code === 403 && typeof body === 'string') {
    // Classify known license refusals without preserving any upstream payload.
    const source = body.slice(0, 4096);
    if (/not enabled for this workspace/i.test(source)) detail = 'not enabled for this workspace';
    else if (/subscription expired/i.test(source)) detail = 'subscription expired';
  }
  return { status: code, message: `API request failed (${code})`, detail };
}

/** A payment redirect is allowed only for the exact server-issued invoice/session pair.
 * Do not trust the upstream hostname alone: a valid Stripe URL may charge another account.
 * No browser callback or redirect is proof of payment.
 */
export function stripeCheckoutRedirect(payload: unknown, expectedInvoiceId: string): URL | null {
  if (!payload || typeof payload !== 'object' ||
      typeof expectedInvoiceId !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(expectedInvoiceId))
    return null;
  const session = payload as Record<string, unknown>;
  if (session.invoiceId !== expectedInvoiceId ||
      typeof session.sessionId !== 'string' ||
      !/^cs_(test_|live_)[A-Za-z0-9]+$/.test(session.sessionId) ||
      typeof session.url !== 'string' || session.url.length > 8192)
    return null;
  try {
    const url = new URL(session.url);
    if (url.origin !== 'https://checkout.stripe.com' ||
        url.username || url.password || url.port ||
        (url.pathname !== `/c/pay/${session.sessionId}` &&
         url.pathname !== `/pay/${session.sessionId}`))
      return null;
    return url;
  } catch { return null; }
}

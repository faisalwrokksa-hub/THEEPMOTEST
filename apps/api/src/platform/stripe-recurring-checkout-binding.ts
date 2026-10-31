/**
 * C30: verify a signed Stripe TEST subscription Checkout against independent
 * Stripe GETs and the tenant-owned immutable C28 Checkout ledger.
 * A signed event only supplies a routing hint; it never establishes tenancy,
 * settles an invoice or grants an entitlement.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ID = (prefix: string, value: unknown): value is string =>
  typeof value === 'string' && new RegExp('^' + prefix + '[A-Za-z0-9]+$').test(value);
const ref = (value: any): string | null =>
  typeof value === 'string' ? value :
    value && typeof value === 'object' && typeof value.id === 'string' ? value.id : null;

export type RecurringCheckoutCandidate = Readonly<{
  eventId: string; sessionId: string; tenantId: string; planId: string;
  stripeSubscriptionId: string; stripeCustomerId: string;
}>;

export type RecordedRecurringCheckout = Readonly<{
  tenantId: string; subscriptionId: string; planId: string;
  stripeSessionId: string; stripePriceId: string;
  liveMode: boolean; priceMinor: number; currency: string;
}>;

export type VerifiedRecurringCheckoutBinding = Readonly<{
  tenantId: string; subscriptionId: string; planId: string;
  stripeCheckoutSessionId: string; stripeSubscriptionId: string;
  stripeCustomerId: string; stripePriceId: string; eventId: string;
}>;

/** Only call AFTER verification of the raw Stripe-Signature header. */
export function parseSignedRecurringCheckout(rawBody: Buffer, liveMode: boolean):
  RecurringCheckoutCandidate | null {
  let event: any;
  try { event = JSON.parse(rawBody.toString('utf8')); }
  catch { throw new Error('Invalid Stripe Checkout event JSON'); }
  if (!event || typeof event !== 'object')
    throw new Error('Invalid Stripe Checkout event');
  if (!['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(event.type))
    return null;
  const session = event.data?.object;
  if (session?.mode !== 'subscription') return null; // Existing one-time billing.
  if (!ID('evt_', event.id) || event.livemode !== liveMode ||
      session.object !== 'checkout.session' ||
      session.livemode !== liveMode ||
      !ID('cs_test_', session.id) || liveMode ||
      session.status !== 'complete' || session.payment_status !== 'paid' ||
      !UUID.test(session.client_reference_id ?? '') ||
      session.metadata?.tenantId !== session.client_reference_id ||
      !UUID.test(session.metadata?.planId ?? '') ||
      !ID('sub_', session.subscription) || !ID('cus_', session.customer))
    throw new Error('Signed recurring Checkout completion is invalid');
  return Object.freeze({
    eventId: event.id, sessionId: session.id,
    tenantId: session.client_reference_id, planId: session.metadata.planId,
    stripeSubscriptionId: session.subscription, stripeCustomerId: session.customer,
  });
}

/** Provider GETs must agree with both the signed event and the tenant ledger. */
export function assertRecurringCheckoutBinding(
  candidate: RecurringCheckoutCandidate, sessionValue: unknown,
  subscriptionValue: unknown, ledger: RecordedRecurringCheckout,
  liveMode: boolean,
): VerifiedRecurringCheckoutBinding {
  if (liveMode || !candidate || !ledger ||
      !UUID.test(ledger.tenantId) || !UUID.test(ledger.subscriptionId) ||
      !UUID.test(ledger.planId) || !ID('price_', ledger.stripePriceId) ||
      ledger.liveMode !== false || !ID('cs_test_', ledger.stripeSessionId) ||
      candidate.tenantId !== ledger.tenantId ||
      candidate.planId !== ledger.planId ||
      candidate.sessionId !== ledger.stripeSessionId ||
      !Number.isSafeInteger(ledger.priceMinor) || ledger.priceMinor <= 0 ||
      !/^[A-Z]{3}$/.test(ledger.currency))
    throw new Error('Recurring Checkout is not owned by the tenant ledger');
  const session = sessionValue as any;
  if (!session || session.object !== 'checkout.session' ||
      session.id !== candidate.sessionId || session.livemode !== false ||
      session.mode !== 'subscription' || session.status !== 'complete' ||
      session.payment_status !== 'paid' ||
      session.client_reference_id !== ledger.tenantId ||
      session.metadata?.tenantId !== ledger.tenantId ||
      session.metadata?.planId !== ledger.planId ||
      ref(session.subscription) !== candidate.stripeSubscriptionId ||
      ref(session.customer) !== candidate.stripeCustomerId ||
      session.amount_total !== ledger.priceMinor ||
      session.currency !== ledger.currency.toLowerCase())
    throw new Error('Stripe Checkout GET does not match the signed event and ledger');
  const sub = subscriptionValue as any;
  if (!sub || sub.object !== 'subscription' || sub.livemode !== false ||
      sub.id !== candidate.stripeSubscriptionId ||
      ref(sub.customer) !== candidate.stripeCustomerId ||
      sub.status !== 'active' || sub.cancel_at_period_end !== false ||
      sub.metadata?.tenantId !== ledger.tenantId ||
      sub.metadata?.planId !== ledger.planId ||
      !Array.isArray(sub.items?.data) || sub.items.data.length !== 1 ||
      sub.items.has_more !== false ||
      (sub.items.total_count != null && sub.items.total_count !== 1) ||
      ref(sub.items.data[0]?.price) !== ledger.stripePriceId ||
      sub.items.data[0]?.quantity !== 1)
    throw new Error('Stripe Subscription GET does not match the Checkout ledger');
  return Object.freeze({
    tenantId: ledger.tenantId, subscriptionId: ledger.subscriptionId,
    planId: ledger.planId, stripeCheckoutSessionId: ledger.stripeSessionId,
    stripeSubscriptionId: candidate.stripeSubscriptionId,
    stripeCustomerId: candidate.stripeCustomerId,
    stripePriceId: ledger.stripePriceId, eventId: candidate.eventId,
  });
}

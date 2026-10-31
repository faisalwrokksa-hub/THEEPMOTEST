/** Stripe payment boundary: signature and semantic validation, without external SDK. */
import { createHmac, timingSafeEqual } from 'node:crypto';
type BillingInvoice = { id: string; tenantId: string; subscriptionId: string; status: string; amountMinor: number; currency: string; periodStartsAt: string | Date; periodEndsAt: string | Date };
type BillingSubscription = { id: string; tenantId: string; status: string; periodEndsAt: string | Date; cancelAtPeriodEnd: boolean };

export const STRIPE_PROVIDER = 'stripe';
export const STRIPE_EVENTS = new Set(['checkout.session.completed', 'checkout.session.async_payment_succeeded']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type StripeCheckoutSession = {
  id: string; object: string; livemode: boolean; mode: string; status: string; payment_status: string;
  amount_total: number | null; currency: string | null;
  payment_intent: string | null; client_reference_id: string | null;
  metadata?: { tenantId?: string; invoiceId?: string } | null;
};
export type StripeEvent = {
  id: string; type: string; livemode: boolean; data: { object: StripeCheckoutSession };
};
export type StripeCheckoutRecord = { stripeSessionId: string; tenantId: string; invoiceId: string };

/** Stripe signs `${timestamp}.${raw_request_bytes}`; tolerate at most 5 minutes of skew. */
export function verifyStripeSignature(rawBody: Buffer | undefined, header: unknown,
  secret: string | undefined, now: number = Date.now()): boolean {
  if (!Buffer.isBuffer(rawBody) || rawBody.length === 0 || rawBody.length > 262_144 ||
      typeof secret !== 'string' || !/^whsec_[A-Za-z0-9]+$/.test(secret) ||
      typeof header !== 'string' || header.length > 2048) return false;
  const pieces = header.split(',').map(s => s.trim());
  if (pieces.some(piece => piece === '')) return false;
  const tsParts = pieces.filter(p => /^t=\d+$/.test(p));
  const sigParts = pieces.filter(p => /^v1=[a-fA-F0-9]{64}$/.test(p));
  if (tsParts.length !== 1 || !sigParts.length) return false;
  const timestamp = tsParts[0].slice(2);
  const seconds = Number(timestamp);
  if (!Number.isSafeInteger(seconds) || seconds <= 0 || Math.abs(now - seconds * 1000) > 300_000)
    return false;
  const expected = createHmac('sha256', secret).update(timestamp).update('.').update(rawBody).digest();
  return sigParts.some(item => {
    const signature = Buffer.from(item.slice(3), 'hex');
    return signature.length === expected.length && timingSafeEqual(signature, expected);
  });
}

export function parsePaidStripeEvent(rawBody: Buffer, liveMode: boolean):
  { eventId: string; session: StripeCheckoutSession } | null {
  let payload: unknown;
  try { payload = JSON.parse(rawBody.toString('utf8')); }
  catch { throw new Error('Stripe payload is not valid JSON'); }
  if (!payload || typeof payload !== 'object') throw new Error('Invalid Stripe event');
  const event = payload as Partial<StripeEvent>;
  if (typeof event.id !== 'string' || !/^evt_[A-Za-z0-9]+$/.test(event.id) ||
      typeof event.type !== 'string' || typeof event.livemode !== 'boolean' ||
      event.livemode !== liveMode) throw new Error('Stripe event identity or mode mismatch');
  if (!STRIPE_EVENTS.has(event.type)) return null; // Other signed Stripe events are ignored.
  const session = event.data?.object;
  if (!session || typeof session !== 'object' || session.object !== 'checkout.session' ||
      typeof session.id !== 'string' || !/^cs_(test_|live_)[A-Za-z0-9]+$/.test(session.id))
    throw new Error('Stripe Checkout session is missing or invalid');
  if (session.livemode !== liveMode)
    throw new Error('Stripe Checkout session mode mismatch');
  if (session.mode !== 'payment' || session.status !== 'complete' || session.payment_status !== 'paid')
    return null; // Never grant on an unpaid/async-pending checkout.
  return { eventId: event.id, session };
}

/** Production processes normally demand live keys. Staging may explicitly
 * run a production Node build with test keys only when BOTH safety flags are set.
 */
export function stripeDeploymentModeAllowed(liveMode: boolean, nodeEnv: string | undefined,
  deploymentEnv: string | undefined, allowTestMode: string | undefined): boolean {
  // The declared deployment target is authoritative. A misconfigured NODE_ENV
  // must never turn a production target into a test-payment environment.
  if (deploymentEnv === 'production')
    return nodeEnv === 'production' && liveMode && allowTestMode !== 'true';
  if (deploymentEnv === 'staging')
    return nodeEnv === 'production' && !liveMode && allowTestMode === 'true';
  if (deploymentEnv === 'development')
    return nodeEnv !== 'production' && !liveMode;
  if (deploymentEnv !== undefined && deploymentEnv !== '') return false;
  // Legacy configurations without DEPLOYMENT_ENV may operate only in a
  // production/live pairing or a local/test pairing. No mixed modes.
  return nodeEnv === 'production' ? liveMode && allowTestMode !== 'true' : !liveMode;
}

/** Hosted Checkout URLs are payment navigation targets, not arbitrary redirects.
 * Preserve Stripe's fragment/query but reject userinfo, nonstandard ports,
 * lookalike hosts, and a bare homepage masquerading as a Checkout session. */
export function stripeCheckoutUrlAllowed(value: unknown): boolean {
  if (typeof value !== 'string' || value.length > 8192) return false;
  try {
    const url = new URL(value);
    return url.origin === 'https://checkout.stripe.com' &&
      !url.username && !url.password && !url.port &&
      url.pathname !== '/' && url.pathname.length > 1;
  } catch { return false; }
}

/** Stable for a pending attempt; different after an expired session was recorded.
 * Prevents Stripe from returning an expired Checkout session for a later retry.
 */
export function stripeCheckoutIdempotencyKey(invoiceId: string, previousSessions: number): string {
  if (!UUID.test(invoiceId) || !Number.isSafeInteger(previousSessions) ||
      previousSessions < 0 || previousSessions > 1_000_000)
    throw new Error('Invalid Stripe Checkout attempt');
  return `theepmo-renewal-${invoiceId}-attempt-${previousSessions}`;
}

/** Metadata, session ID, exact amount/currency and subscription state must all agree. */
export function assertStripeSettlement(session: StripeCheckoutSession, record: StripeCheckoutRecord,
  invoice: BillingInvoice, subscription: BillingSubscription): string {
  if (session.id !== record.stripeSessionId || !UUID.test(record.tenantId) || !UUID.test(record.invoiceId) ||
      session.client_reference_id !== record.invoiceId ||
      session.metadata?.invoiceId !== record.invoiceId || session.metadata?.tenantId !== record.tenantId)
    throw new Error('Stripe session is not linked to this tenant invoice');
  if (session.mode !== 'payment' || session.status !== 'complete' || session.payment_status !== 'paid' ||
      typeof session.payment_intent !== 'string' || !/^pi_[A-Za-z0-9]+$/.test(session.payment_intent))
    throw new Error('Stripe payment is not confirmed');
  if (!Number.isSafeInteger(session.amount_total) || (session.amount_total as number) <= 0 ||
      typeof session.currency !== 'string' || !/^[a-z]{3}$/.test(session.currency))
    throw new Error('Invalid Stripe amount or currency');
  if (invoice.id !== record.invoiceId || invoice.tenantId !== record.tenantId ||
      invoice.status !== 'open' || invoice.amountMinor !== session.amount_total ||
      invoice.currency !== session.currency.toUpperCase())
    throw new Error('Stripe payment does not match open invoice');
  if (invoice.subscriptionId !== subscription.id || subscription.tenantId !== record.tenantId ||
      !['active', 'trialing', 'past_due'].includes(subscription.status) || subscription.cancelAtPeriodEnd ||
      new Date(subscription.periodEndsAt).getTime() !== new Date(invoice.periodStartsAt).getTime() ||
      new Date(invoice.periodEndsAt).getTime() <= new Date(invoice.periodStartsAt).getTime())
    throw new Error('Subscription is not eligible for this payment');
  return session.payment_intent;
}

export function stripeCheckoutParams(invoice: { id: string; tenantId: string; amountMinor: number; currency: string },
  successUrl: string, cancelUrl: string): URLSearchParams {
  if (!UUID.test(invoice.id) || !UUID.test(invoice.tenantId) ||
      !Number.isSafeInteger(invoice.amountMinor) || invoice.amountMinor <= 0 ||
      !/^[A-Z]{3}$/.test(invoice.currency)) throw new Error('Invalid invoice for checkout');
  // Stripe sends the customer back to these URLs. Do not allow an arbitrary
  // external origin or a non-loopback HTTP callback via user-controlled input.
  let success: URL, cancel: URL;
  try {
    success = new URL(successUrl);
    cancel = new URL(cancelUrl);
  } catch { throw new Error('Invalid Checkout redirect URL'); }
  for (const url of [success, cancel]) {
    const localHttp = url.protocol === 'http:' &&
      ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (!(url.protocol === 'https:' || localHttp) || url.username || url.password ||
        url.hash || !url.hostname || url.origin === 'null')
      throw new Error('Invalid Checkout redirect URL');
  }
  if (success.origin !== cancel.origin)
    throw new Error('Checkout redirects must have the same trusted origin');
  return new URLSearchParams({
    mode: 'payment',
    client_reference_id: invoice.id,
    'metadata[tenantId]': invoice.tenantId,
    'metadata[invoiceId]': invoice.id,
    // Checkout session metadata is NOT automatically copied to the PaymentIntent.
    // These server-bound fields permit secure mapping of later refunds/disputes.
    'payment_intent_data[metadata][tenantId]': invoice.tenantId,
    'payment_intent_data[metadata][invoiceId]': invoice.id,
    'payment_method_types[0]': 'card',
    'line_items[0][quantity]': '1',
    'line_items[0][price_data][currency]': invoice.currency.toLowerCase(),
    'line_items[0][price_data][unit_amount]': String(invoice.amountMinor),
    'line_items[0][price_data][product_data][name]': 'The EPMO subscription renewal',
    success_url: successUrl,
    cancel_url: cancelUrl,
  });
}


/** Signed, Stripe-originated negative payment events. No user-controlled tenant IDs. */
export type StripePaymentException = {
  eventId: string; type: 'full_refund' | 'partial_refund' | 'dispute_opened' | 'dispute_closed';
  paymentIntent: string; amountMinor: number; currency: string; providerObjectId: string;
};
export function parseStripePaymentException(rawBody: Buffer, liveMode: boolean): StripePaymentException | null {
  let data: unknown;
  try { data = JSON.parse(rawBody.toString('utf8')); }
  catch { throw new Error('Invalid Stripe exception JSON'); }
  if (!data || typeof data !== 'object') throw new Error('Invalid Stripe exception event');
  const event = data as { id?: unknown; livemode?: unknown; type?: unknown; data?: { object?: any } };
  if (typeof event.id !== 'string' || !/^evt_[A-Za-z0-9]+$/.test(event.id) ||
      event.livemode !== liveMode || typeof event.type !== 'string')
    throw new Error('Invalid Stripe exception identity or mode');
  if (!['charge.refunded', 'charge.dispute.created', 'charge.dispute.closed'].includes(event.type))
    return null;
  const object = event.data?.object;
  const dispute = event.type.startsWith('charge.dispute.');
  if (!object || typeof object !== 'object' ||
      object.object !== (dispute ? 'dispute' : 'charge') ||
      typeof object.id !== 'string' || !(dispute ? /^dp_[A-Za-z0-9]+$/ : /^ch_[A-Za-z0-9]+$/).test(object.id) ||
      typeof object.payment_intent !== 'string' || !/^pi_[A-Za-z0-9]+$/.test(object.payment_intent) ||
      typeof object.currency !== 'string' || !/^[a-z]{3}$/.test(object.currency) ||
      !Number.isSafeInteger(object.amount) || object.amount <= 0)
    throw new Error('Stripe refund/dispute contains invalid payment reference');
  let type: StripePaymentException['type'];
  let amount: number;
  if (dispute) {
    if (event.type === 'charge.dispute.created' && object.status !== 'needs_response' &&
        object.status !== 'under_review' && object.status !== 'warning_needs_response' &&
        object.status !== 'warning_under_review')
      throw new Error('Unexpected opened dispute status');
    if (event.type === 'charge.dispute.closed' && !['won', 'lost', 'warning_closed'].includes(object.status))
      throw new Error('Unexpected closed dispute status');
    type = event.type === 'charge.dispute.created' ? 'dispute_opened' : 'dispute_closed';
    amount = object.amount;
  } else {
    if (!Number.isSafeInteger(object.amount_refunded) || object.amount_refunded <= 0 ||
        object.amount_refunded > object.amount)
      throw new Error('Invalid refunded amount');
    type = object.amount_refunded === object.amount ? 'full_refund' : 'partial_refund';
    amount = object.amount_refunded; // Stripe reports cumulative refunded amount.
  }
  return { eventId: event.id, type, paymentIntent: object.payment_intent,
    amountMinor: amount, currency: object.currency.toUpperCase(), providerObjectId: object.id };
}

/** Stripe PaymentIntent is retrieved server-side from Stripe, never from the browser. */
export function assertStripeExceptionIntent(intent: any, event: StripePaymentException, liveMode: boolean) {
  if (!intent || intent.object !== 'payment_intent' || intent.id !== event.paymentIntent ||
      intent.livemode !== liveMode ||
      typeof intent.metadata?.tenantId !== 'string' || !UUID.test(intent.metadata.tenantId) ||
      typeof intent.metadata?.invoiceId !== 'string' || !UUID.test(intent.metadata.invoiceId) ||
      !Number.isSafeInteger(intent.amount) || intent.amount < event.amountMinor ||
      intent.currency?.toUpperCase() !== event.currency ||
      intent.status !== 'succeeded')
    throw new Error('PaymentIntent is not verifiably linked to a tenant invoice');
  return { tenantId: intent.metadata.tenantId as string, invoiceId: intent.metadata.invoiceId as string };
}

/** Stripe's charge.refunded amount is cumulative for one charge, not necessarily
 * the entire paid invoice. A full charge refund must never revoke access if
 * other captured funds for that invoice remain unrefunded. */
export function refundCoversPaidInvoice(refundedAmountMinor: number, paidAmountMinor: number): boolean {
  return Number.isSafeInteger(refundedAmountMinor) && Number.isSafeInteger(paidAmountMinor) &&
    paidAmountMinor > 0 && refundedAmountMinor === paidAmountMinor;
}

/** A refund/dispute affects current access only if the paid period is still current. */
export function shouldPauseOnPaymentException(type: StripePaymentException['type'],
  subscription: { id: string; status: string; periodEndsAt: Date | string },
  invoice: { subscriptionId: string; periodEndsAt: Date | string }, latestSubscriptionId: string,
  now: Date | string = new Date()): boolean {
  const periodEnd = new Date(invoice.periodEndsAt).getTime();
  const clock = new Date(now).getTime();
  return (type === 'full_refund' || type === 'dispute_opened') && subscription.status === 'active' &&
    subscription.id === invoice.subscriptionId && subscription.id === latestSubscriptionId &&
    Number.isFinite(periodEnd) && periodEnd > clock &&
    new Date(subscription.periodEndsAt).getTime() === periodEnd;
}

/** Invoice equality is checked before handling funds that arrived after cancellation. */
export function assertStripePaymentInvoiceMatch(session: StripeCheckoutSession, record: StripeCheckoutRecord,
  invoice: BillingInvoice): string {
  if (session.id !== record.stripeSessionId || !UUID.test(record.tenantId) || !UUID.test(record.invoiceId) ||
      session.client_reference_id !== record.invoiceId || session.metadata?.tenantId !== record.tenantId ||
      session.metadata?.invoiceId !== record.invoiceId ||
      session.mode !== 'payment' || session.status !== 'complete' || session.payment_status !== 'paid' ||
      typeof session.payment_intent !== 'string' || !/^pi_[A-Za-z0-9]+$/.test(session.payment_intent) ||
      invoice.id !== record.invoiceId || invoice.tenantId !== record.tenantId ||
      (typeof session.amount_total !== 'number' || !Number.isSafeInteger(session.amount_total) || session.amount_total <= 0) ||
      session.amount_total !== invoice.amountMinor ||
      session.currency?.toUpperCase() !== invoice.currency)
    throw new Error('Stripe captured payment cannot be linked to the recorded invoice');
  return session.payment_intent;
}

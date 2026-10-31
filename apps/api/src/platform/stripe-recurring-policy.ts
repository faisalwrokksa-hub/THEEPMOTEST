/**
 * C25: fail-closed primitives for FIRST-CUSTOMER recurring Stripe Checkout.
 * This module does not initiate a charge, process webhooks or grant access.
 * Wiring requires an atomic provider-subscription ledger and signed invoice
 * reconciliation; never expose Checkout before that path is complete.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PRICE = /^price_[A-Za-z0-9]+$/;
const SESSION = /^cs_(test_|live_)[A-Za-z0-9]+$/;
const verifiedPrices = new WeakSet<object>();
export type VerifiedRecurringPrice = Readonly<{ priceId: string; planId: string; liveMode: boolean }>;

export type RecurringPlan = Readonly<{
  id: string; code: string; priceMinor: number; currency: string;
  billingInterval: 'monthly' | 'yearly'; trialDays: number; isActive: boolean;
}>;

function assertPlan(plan: RecurringPlan): void {
  if (!UUID.test(plan.id) || !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(plan.code) ||
      !Number.isSafeInteger(plan.priceMinor) || plan.priceMinor <= 0 ||
      !/^[A-Z]{3}$/.test(plan.currency) ||
      !['monthly', 'yearly'].includes(plan.billingInterval) ||
      !Number.isSafeInteger(plan.trialDays) || plan.trialDays !== 0 ||
      plan.isActive !== true)
    throw new Error('Recurring plan is not eligible for paid Checkout');
}

/** Verify a server-configured Stripe Price using a direct authenticated
 * GET /v1/prices/{id} before building any subscription-mode Checkout.
 * A caller-provided price ID must never be trusted.
 */
export function assertRecurringStripePrice(value: unknown, plan: RecurringPlan,
  expectedPriceId: string, liveMode: boolean): VerifiedRecurringPrice {
  assertPlan(plan);
  if (!PRICE.test(expectedPriceId) || !value || typeof value !== 'object')
    throw new Error('Invalid recurring Stripe Price');
  const price = value as Record<string, any>;
  if (price.object !== 'price' || price.id !== expectedPriceId ||
      price.active !== true || price.livemode !== liveMode ||
      price.type !== 'recurring' || price.billing_scheme !== 'per_unit' ||
      price.currency !== plan.currency.toLowerCase() ||
      price.unit_amount !== plan.priceMinor || price.unit_amount_decimal !== undefined &&
        price.unit_amount_decimal !== String(plan.priceMinor) ||
      price.recurring?.interval !== (plan.billingInterval === 'monthly' ? 'month' : 'year') ||
      price.recurring?.interval_count !== 1 ||
      price.recurring?.usage_type !== 'licensed')
    throw new Error('Stripe recurring Price does not match the authorized plan');
  const verified = Object.freeze({ priceId: expectedPriceId, planId: plan.id, liveMode });
  verifiedPrices.add(verified);
  return verified;
}

function validateRedirects(successUrl: string, cancelUrl: string): void {
  let success: URL, cancel: URL;
  try { success = new URL(successUrl); cancel = new URL(cancelUrl); }
  catch { throw new Error('Invalid recurring Checkout redirect'); }
  for (const url of [success, cancel]) {
    const loopback = url.protocol === 'http:' &&
      ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (!(url.protocol === 'https:' || loopback) ||
        url.username || url.password || url.hash || !url.hostname)
      throw new Error('Untrusted recurring Checkout redirect');
  }
  if (success.origin !== cancel.origin)
    throw new Error('Recurring Checkout redirects must share one trusted origin');
}

/** Called ONLY after assertRecurringStripePrice and a tenant-scoped DB lock.
 * No trial, coupon, tax override, browser price, or immediate entitlement grant.
 */
export function stripeRecurringCheckoutParams(plan: RecurringPlan, tenantId: string,
  verifiedPrice: VerifiedRecurringPrice, liveMode: boolean,
  successUrl: string, cancelUrl: string): URLSearchParams {
  assertPlan(plan);
  if (!UUID.test(tenantId) || !verifiedPrice || !verifiedPrices.has(verifiedPrice) ||
      verifiedPrice.planId !== plan.id || verifiedPrice.liveMode !== liveMode)
    throw new Error('Invalid recurring Checkout identity');
  validateRedirects(successUrl, cancelUrl);
  return new URLSearchParams({
    mode: 'subscription',
    client_reference_id: tenantId,
    'metadata[tenantId]': tenantId,
    'metadata[planId]': plan.id,
    'subscription_data[metadata][tenantId]': tenantId,
    'subscription_data[metadata][planId]': plan.id,
    'payment_method_types[0]': 'card',
    'line_items[0][price]': verifiedPrice.priceId,
    'line_items[0][quantity]': '1',
    success_url: successUrl,
    cancel_url: cancelUrl,
  });
}

export function stripeRecurringIdempotencyKey(tenantId: string, planId: string,
  attempt: number): string {
  if (!UUID.test(tenantId) || !UUID.test(planId) ||
      !Number.isSafeInteger(attempt) || attempt < 0 || attempt > 1_000_000)
    throw new Error('Invalid recurring Checkout attempt');
  return `theepmo-subscription-${tenantId}-${planId}-attempt-${attempt}`;
}

/** Provider response validation BEFORE persisting or redirecting.
 * Payment is still unverified. A signed invoice settlement is mandatory.
 */
export function assertCreatedRecurringCheckout(value: unknown, plan: RecurringPlan,
  tenantId: string, liveMode: boolean, now: number = Date.now()): { sessionId: string; url: string } {
  assertPlan(plan);
  if (!UUID.test(tenantId) || !value || typeof value !== 'object')
    throw new Error('Invalid recurring Checkout response');
  const session = value as Record<string, any>;
  if (session.object !== 'checkout.session' || typeof session.id !== 'string' ||
      !SESSION.test(session.id) || session.id.startsWith('cs_live_') !== liveMode ||
      session.livemode !== liveMode || session.mode !== 'subscription' ||
      session.status !== 'open' || session.payment_status !== 'unpaid' ||
      session.subscription !== null || session.client_reference_id !== tenantId ||
      session.metadata?.tenantId !== tenantId || session.metadata?.planId !== plan.id ||
      session.currency !== plan.currency.toLowerCase() ||
      session.amount_total !== plan.priceMinor ||
      !Number.isSafeInteger(session.expires_at) || session.expires_at * 1000 <= now + 60_000 ||
      typeof session.url !== 'string' || session.url.length > 8192)
    throw new Error('Recurring Checkout session failed provider validation');
  let url: URL;
  try { url = new URL(session.url); }
  catch { throw new Error('Invalid recurring Checkout URL'); }
  if (url.origin !== 'https://checkout.stripe.com' || url.username || url.password ||
      !['/c/pay/', '/pay/'].some(prefix => url.pathname === prefix + session.id))
    throw new Error('Recurring Checkout URL is not bound to the session');
  return { sessionId: session.id, url: session.url };
}

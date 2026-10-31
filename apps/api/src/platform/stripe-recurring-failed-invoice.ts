/**
 * C34: TEST-only recurring invoice.payment_failed verification.
 * A signed snapshot is not authority to revoke/grant tenant access. The caller
 * independently GETs Stripe Invoice, Subscription, Price and (if present)
 * PaymentIntent, then reconciles the immutable tenant binding under a lock.
 */
import type { TrustedRecurringBinding } from './stripe-recurring-reconciliation';
import type { RecurringPlan } from './stripe-recurring-policy';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const id = (prefix: string, value: unknown): value is string =>
  typeof value === 'string' && value.startsWith(prefix) &&
  /^[A-Za-z0-9]+$/.test(value.slice(prefix.length)) && value.length > prefix.length;
const ref = (value: any): string | null =>
  typeof value === 'string' ? value :
  value && typeof value === 'object' && typeof value.id === 'string' ? value.id : null;

export type FailedRecurringInvoiceCandidate = Readonly<{
  eventId: string; invoiceId: string; stripeSubscriptionId: string;
  stripeCustomerId: string; billingReason: 'subscription_create' | 'subscription_cycle';
  amountMinor: number; currency: string; attemptCount: number;
}>;

export type FailedRecurringLocal = Readonly<{
  id: string; planId: string; status: string; cancelAtPeriodEnd: boolean;
  periodStartsAt: string | Date; periodEndsAt: string | Date;
}>;

export function parseFailedRecurringInvoice(raw: Buffer, liveMode: boolean):
  FailedRecurringInvoiceCandidate | null {
  let event: any;
  try { event = JSON.parse(raw.toString('utf8')); }
  catch { throw new Error('Invalid signed failed invoice JSON'); }
  if (event?.type !== 'invoice.payment_failed') return null;
  const invoice = event?.data?.object;
  const oldSub = ref(invoice?.subscription);
  const parentSub = ref(invoice?.parent?.subscription_details?.subscription);
  if (oldSub && parentSub && oldSub !== parentSub)
    throw new Error('Conflicting signed failed invoice subscription references');
  if (!id('evt_', event.id) || event.livemode !== liveMode ||
      !invoice || invoice.object !== 'invoice' || invoice.livemode !== liveMode ||
      !id('in_', invoice.id) || !id('cus_', ref(invoice.customer)) ||
      !id('sub_', oldSub ?? parentSub) ||
      invoice.status !== 'open' || invoice.paid !== false ||
      invoice.collection_method !== 'charge_automatically' ||
      !['subscription_create', 'subscription_cycle'].includes(invoice.billing_reason) ||
      !Number.isSafeInteger(invoice.amount_due) || invoice.amount_due <= 0 ||
      invoice.amount_paid !== 0 || invoice.amount_remaining !== invoice.amount_due ||
      !/^[a-z]{3}$/.test(invoice.currency) ||
      !Number.isSafeInteger(invoice.attempt_count) || invoice.attempt_count < 1)
    throw new Error('Signed invoice is not a failed automatic recurring payment');
  return Object.freeze({
    eventId: event.id, invoiceId: invoice.id,
    stripeSubscriptionId: oldSub ?? parentSub!,
    stripeCustomerId: ref(invoice.customer)!,
    billingReason: invoice.billing_reason,
    amountMinor: invoice.amount_due,
    currency: invoice.currency.toUpperCase(),
    attemptCount: invoice.attempt_count,
  });
}

export function failedInvoicePaymentIntentId(invoice: unknown): string | null {
  const value = invoice as any;
  const direct = ref(value?.payment_intent);
  const page = value?.payments;
  if (page != null &&
      (!Array.isArray(page.data) || page.data.length > 1 ||
       (page.has_more !== undefined && page.has_more !== false) ||
       (page.total_count !== undefined && page.total_count !== page.data.length)))
    throw new Error('Incomplete or ambiguous failed invoice payments list');
  const fromList = page?.data?.length ? ref(page.data[0]?.payment?.payment_intent) : null;
  if (direct && fromList && direct !== fromList)
    throw new Error('Conflicting failed invoice payment references');
  const chosen = direct ?? fromList;
  if (chosen !== null && !id('pi_', chosen))
    throw new Error('Invalid failed invoice payment reference');
  return chosen;
}

export function assertFailedRecurringProvider(
  candidate: FailedRecurringInvoiceCandidate, invoiceValue: unknown,
  subscriptionValue: unknown, intentValue: unknown,
  binding: TrustedRecurringBinding, plan: RecurringPlan,
  local: FailedRecurringLocal, latestSubscriptionId: string,
  liveMode: boolean, now: number = Date.now(),
): Readonly<{ shouldPause: boolean; periodEndsAt: string }> {
  const invoice = invoiceValue as any;
  const sub = subscriptionValue as any;
  if (liveMode || !candidate || !binding || !plan || !local ||
      !UUID.test(binding.tenantId) || !UUID.test(binding.subscriptionId) ||
      !UUID.test(binding.planId) || binding.planId !== plan.id ||
      latestSubscriptionId !== binding.subscriptionId ||
      local.id !== binding.subscriptionId || local.planId !== binding.planId ||
      local.cancelAtPeriodEnd !== false || binding.cancelAtPeriodEnd !== false ||
      !['pending', 'active'].includes(binding.status) ||
      candidate.stripeSubscriptionId !== binding.stripeSubscriptionId ||
      candidate.stripeCustomerId !== binding.stripeCustomerId ||
      candidate.currency !== plan.currency || candidate.amountMinor !== plan.priceMinor ||
      !Number.isSafeInteger(plan.priceMinor) || plan.priceMinor <= 0 ||
      plan.trialDays !== 0 || plan.isActive !== true ||
      !['monthly', 'yearly'].includes(plan.billingInterval))
    throw new Error('Failed recurring invoice is not owned by the current tenant plan');
  const initial = candidate.billingReason === 'subscription_create';
  if (initial !== (binding.status === 'pending') ||
      (initial ? binding.lastPeriodEndsAt !== null :
        !binding.lastPeriodEndsAt || !['active', 'past_due'].includes(local.status)) ||
      (initial && !['trialing', 'past_due'].includes(local.status)))
    throw new Error('Failed recurring invoice lifecycle is out of order');
  if (!invoice || invoice.object !== 'invoice' || invoice.livemode !== false ||
      invoice.id !== candidate.invoiceId || invoice.status !== 'open' ||
      invoice.paid !== false || invoice.collection_method !== 'charge_automatically' ||
      invoice.billing_reason !== candidate.billingReason ||
      ref(invoice.customer) !== binding.stripeCustomerId ||
      ref(invoice.subscription ?? invoice.parent?.subscription_details?.subscription) !== binding.stripeSubscriptionId ||
      (invoice.subscription != null && invoice.parent?.subscription_details?.subscription != null &&
       ref(invoice.subscription) !== ref(invoice.parent.subscription_details.subscription)) ||
      invoice.amount_due !== plan.priceMinor || invoice.total !== plan.priceMinor ||
      invoice.amount_paid !== 0 || invoice.amount_remaining !== plan.priceMinor ||
      invoice.currency !== plan.currency.toLowerCase() ||
      !Number.isSafeInteger(invoice.attempt_count) ||
      invoice.attempt_count < candidate.attemptCount)
    throw new Error('Stripe Invoice GET does not confirm an outstanding failed charge');
  const page = invoice.lines;
  if (!page || !Array.isArray(page.data) || page.data.length !== 1 ||
      (page.has_more !== undefined && page.has_more !== false) ||
      (page.total_count !== undefined && page.total_count !== 1))
    throw new Error('Failed invoice service line is incomplete');
  const line = page.data[0];
  const oldPrice = ref(line?.price);
  const newPrice = ref(line?.pricing?.price_details?.price);
  if (oldPrice && newPrice && oldPrice !== newPrice)
    throw new Error('Failed invoice price references conflict');
  if ((oldPrice ?? newPrice) !== binding.stripePriceId ||
      line.quantity !== 1 || line.amount !== plan.priceMinor ||
      line.proration === true || (line.type != null && line.type !== 'subscription') ||
      !Number.isSafeInteger(line.period?.start) ||
      !Number.isSafeInteger(line.period?.end))
    throw new Error('Failed invoice line does not match tenant plan');
  const start = line.period.start * 1000;
  const end = line.period.end * 1000;
  const days = (end - start) / 86_400_000;
  const localStart = new Date(local.periodStartsAt).getTime();
  const localEnd = new Date(local.periodEndsAt).getTime();
  if (![start, end, localStart, localEnd, now].every(Number.isFinite) ||
      start <= 0 || end <= start || localEnd <= localStart ||
      (plan.billingInterval === 'monthly' ? days < 27 || days > 32 : days < 364 || days > 367) ||
      (initial ? start < localStart :
        Date.parse(binding.lastPeriodEndsAt!) !== start || localEnd !== start))
    throw new Error('Failed recurring invoice period is invalid or noncontiguous');
  if (!sub || sub.object !== 'subscription' || sub.livemode !== false ||
      sub.id !== binding.stripeSubscriptionId ||
      ref(sub.customer) !== binding.stripeCustomerId ||
      !['incomplete', 'past_due', 'unpaid'].includes(sub.status) ||
      sub.cancel_at_period_end !== false ||
      ref(sub.latest_invoice) !== candidate.invoiceId ||
      sub.metadata?.tenantId !== binding.tenantId ||
      sub.metadata?.planId !== binding.planId)
    throw new Error('Stripe Subscription GET does not match the failed tenant invoice');
  const items = sub.items;
  if (!items || !Array.isArray(items.data) || items.data.length !== 1 ||
      (items.has_more !== undefined && items.has_more !== false) ||
      (items.total_count !== undefined && items.total_count !== 1) ||
      ref(items.data[0]?.price) !== binding.stripePriceId ||
      items.data[0]?.quantity !== 1)
    throw new Error('Stripe failed subscription price list is ambiguous');
  const paymentIntentId = failedInvoicePaymentIntentId(invoice);
  if (paymentIntentId) {
    const intent = intentValue as any;
    if (!intent || intent.object !== 'payment_intent' ||
        intent.id !== paymentIntentId || intent.livemode !== false ||
        !['requires_payment_method', 'requires_action', 'canceled'].includes(intent.status) ||
        intent.amount !== plan.priceMinor || intent.amount_received !== 0 ||
        intent.currency !== plan.currency.toLowerCase() ||
        ref(intent.customer) !== binding.stripeCustomerId ||
        ref(intent.invoice) !== candidate.invoiceId)
      throw new Error('Stripe PaymentIntent GET is not an unpaid failed charge');
  } else if (intentValue != null) {
    throw new Error('Unexpected failed invoice PaymentIntent');
  }
  return Object.freeze({ shouldPause: localEnd <= now, periodEndsAt: new Date(end).toISOString() });
}

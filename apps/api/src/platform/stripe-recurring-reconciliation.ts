/**
 * C26: provider-reconciled recurring invoice settlement boundary.
 *
 * The caller MUST first verify the signed raw Stripe event, independently
 * retrieve Invoice, Subscription and PaymentIntent from the Stripe TEST API,
 * and load the binding from a tenant-scoped persisted ledger (never event
 * metadata). Only after this pure validation may a future transactional
 * settlement implementation insert a globally unique payment, webhook receipt
 * and extend an entitlement under the tenant advisory lock.
 *
 * This module NEVER creates Checkout, writes a database row or grants access.
 */
import type { RecurringInvoiceCandidate, } from './stripe-recurring-invoice';
import type { RecurringPlan } from './stripe-recurring-policy';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ID = (prefix: string, value: unknown): value is string =>
  typeof value === 'string' && new RegExp('^' + prefix + '[A-Za-z0-9]+$').test(value);

export type TrustedRecurringBinding = Readonly<{
  tenantId: string;
  subscriptionId: string; // Local tenant_subscriptions UUID
  planId: string;
  stripeSubscriptionId: string;
  stripeCustomerId: string;
  stripePriceId: string;
  status: 'pending' | 'active';
  lastPeriodEndsAt: string | null;
  cancelAtPeriodEnd: boolean;
}>;

export type VerifiedRecurringSettlement = Readonly<{
  tenantId: string; subscriptionId: string; planId: string;
  stripeInvoiceId: string; stripeSubscriptionId: string;
  paymentIntentId: string; eventId: string;
  amountMinor: number; currency: string;
  periodStartsAt: string; periodEndsAt: string;
}>;

function oneItem(value: unknown, message: string): any {
  const items = (value as any)?.data;
  if (!Array.isArray(items) || items.length !== 1 || !items[0] || typeof items[0] !== 'object')
    throw new Error(message);
  return items[0];
}

function periodDate(seconds: unknown): string {
  if (!Number.isSafeInteger(seconds) || (seconds as number) <= 0 ||
      (seconds as number) > 8_640_000_000)
    throw new Error('Invalid recurring invoice service period');
  const date = new Date((seconds as number) * 1000);
  if (!Number.isFinite(date.getTime()))
    throw new Error('Invalid recurring invoice service period');
  return date.toISOString();
}

function reference(value: any): string | null {
  return typeof value === 'string' ? value :
    value && typeof value === 'object' && typeof value.id === 'string' ? value.id : null;
}

/**
 * A signed invoice is only a candidate. Reconcile it against independent
 * provider GET responses and the *already persisted* tenant binding.
 * Never use Stripe invoice/customer metadata to discover tenant ownership.
 */
export function assertRecurringProviderSettlement(
  candidate: RecurringInvoiceCandidate,
  invoiceValue: unknown,
  subscriptionValue: unknown,
  intentValue: unknown,
  binding: TrustedRecurringBinding,
  plan: RecurringPlan,
  liveMode: boolean,
): VerifiedRecurringSettlement {
  if (!binding || !UUID.test(binding.tenantId) || !UUID.test(binding.subscriptionId) ||
      !UUID.test(binding.planId) || binding.planId !== plan?.id ||
      !ID('sub_', binding.stripeSubscriptionId) ||
      !ID('cus_', binding.stripeCustomerId) || !ID('price_', binding.stripePriceId) ||
      binding.cancelAtPeriodEnd !== false ||
      !['pending', 'active'].includes(binding.status))
    throw new Error('Untrusted or canceled recurring tenant binding');
  if (!candidate || !ID('evt_', candidate.eventId) ||
      !ID('in_', candidate.invoiceId) ||
      candidate.subscriptionId !== binding.stripeSubscriptionId ||
      candidate.customerId !== binding.stripeCustomerId ||
      !['subscription_create', 'subscription_cycle'].includes(candidate.billingReason) ||
      !Number.isSafeInteger(candidate.amountMinor) || candidate.amountMinor <= 0 ||
      candidate.currency !== plan.currency ||
      !Number.isSafeInteger(plan.priceMinor) || plan.priceMinor <= 0 ||
      candidate.amountMinor !== plan.priceMinor ||
      !['monthly', 'yearly'].includes(plan.billingInterval) || plan.trialDays !== 0)
    throw new Error('Signed recurring invoice does not match the authorized plan');
  const initial = candidate.billingReason === 'subscription_create';
  if (initial !== (binding.status === 'pending') ||
      (initial ? binding.lastPeriodEndsAt !== null : !binding.lastPeriodEndsAt))
    throw new Error('Recurring invoice is out of lifecycle order');

  const invoice = invoiceValue as any;
  const subscription = subscriptionValue as any;
  const intent = intentValue as any;
  if (!invoice || invoice.object !== 'invoice' || invoice.livemode !== liveMode ||
      invoice.id !== candidate.invoiceId || invoice.status !== 'paid' ||
      invoice.paid !== true || invoice.collection_method !== 'charge_automatically' ||
      invoice.billing_reason !== candidate.billingReason ||
      reference(invoice.customer) !== binding.stripeCustomerId ||
      reference(invoice.subscription ?? invoice.parent?.subscription_details?.subscription) !== binding.stripeSubscriptionId ||
      (invoice.subscription != null && invoice.parent?.subscription_details?.subscription != null &&
       reference(invoice.subscription) !== reference(invoice.parent.subscription_details.subscription)) ||
      invoice.currency !== plan.currency.toLowerCase() ||
      invoice.amount_due !== plan.priceMinor || invoice.amount_paid !== plan.priceMinor ||
      invoice.total !== plan.priceMinor || invoice.amount_remaining !== 0)
    throw new Error('Stripe Invoice GET does not confirm the signed paid invoice');
  const line = oneItem(invoice.lines, 'Recurring invoice must contain exactly one service line');
  const linePrice = reference(line.price) ?? line.pricing?.price_details?.price;
  if (linePrice !== binding.stripePriceId || line.quantity !== 1 ||
      line.amount !== plan.priceMinor || line.proration === true ||
      (line.type != null && line.type !== 'subscription'))
    throw new Error('Recurring invoice service line does not match the plan');
  const periodStartsAt = periodDate(line.period?.start);
  const periodEndsAt = periodDate(line.period?.end);
  const start = Date.parse(periodStartsAt), end = Date.parse(periodEndsAt);
  const days = (end - start) / 86_400_000;
  if (end <= start ||
      (plan.billingInterval === 'monthly' ? days < 27 || days > 32 : days < 364 || days > 367))
    throw new Error('Recurring invoice has an invalid billing interval');
  if (!initial && Date.parse(binding.lastPeriodEndsAt!) !== start)
    throw new Error('Recurring invoice period is not contiguous with the tenant ledger');

  if (!subscription || subscription.object !== 'subscription' ||
      subscription.livemode !== liveMode ||
      subscription.id !== binding.stripeSubscriptionId ||
      reference(subscription.customer) !== binding.stripeCustomerId ||
      subscription.status !== 'active' || subscription.cancel_at_period_end !== false ||
      reference(subscription.latest_invoice) !== candidate.invoiceId ||
      subscription.metadata?.tenantId !== binding.tenantId ||
      subscription.metadata?.planId !== binding.planId)
    throw new Error('Stripe Subscription GET does not match the tenant binding');
  const item = oneItem(subscription.items, 'Recurring subscription must have exactly one price');
  if (reference(item.price) !== binding.stripePriceId || item.quantity !== 1)
    throw new Error('Recurring subscription has a different price or quantity');

  const paymentRef = reference(invoice.payment_intent);
  const invoicePayment = invoice.payments?.data;
  const paymentFromList = Array.isArray(invoicePayment) && invoicePayment.length === 1 ?
    reference(invoicePayment[0]?.payment?.payment_intent) : null;
  if (Array.isArray(invoicePayment) && invoicePayment.length !== 1)
    throw new Error('Recurring invoice has ambiguous payment records');
  if (paymentRef && paymentFromList && paymentRef !== paymentFromList)
    throw new Error('Conflicting Stripe invoice payment references');
  const paymentIntentId = paymentRef ?? paymentFromList;
  if (!ID('pi_', paymentIntentId) || !intent || intent.object !== 'payment_intent' ||
      intent.id !== paymentIntentId || intent.livemode !== liveMode ||
      intent.status !== 'succeeded' || intent.amount_received !== plan.priceMinor ||
      intent.currency !== plan.currency.toLowerCase() ||
      reference(intent.customer) !== binding.stripeCustomerId ||
      reference(intent.invoice) !== candidate.invoiceId)
    throw new Error('Stripe PaymentIntent GET does not confirm captured invoice funds');

  return Object.freeze({
    tenantId: binding.tenantId, subscriptionId: binding.subscriptionId, planId: binding.planId,
    stripeInvoiceId: candidate.invoiceId, stripeSubscriptionId: binding.stripeSubscriptionId,
    paymentIntentId, eventId: candidate.eventId, amountMinor: plan.priceMinor,
    currency: plan.currency, periodStartsAt, periodEndsAt,
  });
}

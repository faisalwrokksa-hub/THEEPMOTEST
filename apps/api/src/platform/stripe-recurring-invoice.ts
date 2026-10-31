/**
 * C25: recognize signed recurring invoice settlement candidates.
 * Caller MUST verify the raw Stripe signature before invoking this parser,
 * retrieve the provider Subscription and Invoice independently, and reconcile
 * tenant, plan, period, payment and ledger under a tenant lock.
 * This parser NEVER grants entitlements or trusts invoice metadata as tenancy.
 */
const ID = /^[A-Za-z0-9]+$/;
export type RecurringInvoiceCandidate = Readonly<{
  eventId: string; invoiceId: string; subscriptionId: string; customerId: string;
  amountMinor: number; currency: string; billingReason: 'subscription_create' | 'subscription_cycle';
}>;

export function parsePaidRecurringInvoice(rawBody: Buffer, liveMode: boolean):
  RecurringInvoiceCandidate | null {
  let payload: unknown;
  try { payload = JSON.parse(rawBody.toString('utf8')); }
  catch { throw new Error('Invalid recurring Stripe invoice JSON'); }
  if (!payload || typeof payload !== 'object')
    throw new Error('Invalid recurring Stripe invoice event');
  const event = payload as Record<string, any>;
  if (typeof event.id !== 'string' || !event.id.startsWith('evt_') ||
      !ID.test(event.id.slice(4)) || event.livemode !== liveMode ||
      typeof event.type !== 'string')
    throw new Error('Recurring Stripe invoice event identity or mode mismatch');
  if (event.type !== 'invoice.paid') return null;
  const invoice = event.data?.object;
  if (!invoice || invoice.object !== 'invoice' || invoice.livemode !== liveMode ||
      typeof invoice.id !== 'string' || !invoice.id.startsWith('in_') ||
      !ID.test(invoice.id.slice(3)) || invoice.status !== 'paid' || invoice.paid !== true ||
      invoice.collection_method !== 'charge_automatically' ||
      !['subscription_create', 'subscription_cycle'].includes(invoice.billing_reason) ||
      typeof invoice.customer !== 'string' || !/^cus_[A-Za-z0-9]+$/.test(invoice.customer) ||
      !Number.isSafeInteger(invoice.amount_due) || invoice.amount_due <= 0 ||
      !Number.isSafeInteger(invoice.amount_paid) || invoice.amount_paid !== invoice.amount_due ||
      typeof invoice.currency !== 'string' || !/^[a-z]{3}$/.test(invoice.currency))
    throw new Error('Recurring Stripe invoice is not a fully paid automatic charge');
  // Stripe invoice API versions expose the subscription under different
  // fields. If both are supplied, they must identify the SAME subscription.
  const oldSubscription = invoice.subscription;
  const parentSubscription = invoice.parent?.subscription_details?.subscription;
  if (oldSubscription != null && parentSubscription != null &&
      oldSubscription !== parentSubscription)
    throw new Error('Conflicting Stripe invoice subscription references');
  const subscriptionId = parentSubscription ?? oldSubscription;
  if (typeof subscriptionId !== 'string' || !/^sub_[A-Za-z0-9]+$/.test(subscriptionId))
    throw new Error('Missing Stripe recurring subscription reference');
  return { eventId: event.id, invoiceId: invoice.id, subscriptionId,
    customerId: invoice.customer, amountMinor: invoice.amount_paid,
    currency: invoice.currency.toUpperCase(), billingReason: invoice.billing_reason };
}

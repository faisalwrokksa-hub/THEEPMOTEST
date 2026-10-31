/**
 * C33: Stripe TEST recurring cancellation candidate and provider reconciliation.
 * Only call after verification of the raw Stripe-Signature. Signed metadata
 * and provider metadata are routing hints, never a grant or tenant authority.
 * Database writes and replay control remain in the tenant-locked service.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const id = (prefix: string, value: unknown): value is string =>
  typeof value === 'string' && new RegExp('^' + prefix + '[A-Za-z0-9]+$').test(value);

export type RecurringCancellationCandidate = Readonly<{
  eventId: string; stripeSubscriptionId: string; customerId: string;
  tenantId: string; planId: string; terminal: boolean;
}>;

export type RecurringCancellationLedger = Readonly<{
  tenantId: string; subscriptionId: string; planId: string;
  stripeSubscriptionId: string; stripeCustomerId: string; stripePriceId: string;
  bindingStatus: string; localStatus: string;
}>;

export function parseRecurringCancellation(rawBody: Buffer, liveMode: boolean):
  RecurringCancellationCandidate | null {
  let event: any;
  try { event = JSON.parse(rawBody.toString('utf8')); }
  catch { throw new Error('Invalid signed recurring cancellation JSON'); }
  if (event?.type !== 'customer.subscription.deleted' &&
      event?.type !== 'customer.subscription.updated') return null;
  const subscription = event?.data?.object;
  // Other subscription updates are not cancellation signals.
  if (event.type === 'customer.subscription.updated' &&
      subscription?.cancel_at_period_end === false) return null;
  const terminal = event.type === 'customer.subscription.deleted';
  if (!id('evt_', event.id) || event.livemode !== liveMode ||
      !subscription || subscription.object !== 'subscription' ||
      subscription.livemode !== liveMode ||
      !id('sub_', subscription.id) || !id('cus_', subscription.customer) ||
      !UUID.test(subscription.metadata?.tenantId ?? '') ||
      !UUID.test(subscription.metadata?.planId ?? '') ||
      (terminal ? subscription.status !== 'canceled' :
        (subscription.cancel_at_period_end !== true ||
         !['active', 'trialing', 'past_due'].includes(subscription.status))))
    throw new Error('Invalid recurring cancellation identity or status');
  return Object.freeze({
    eventId: event.id, stripeSubscriptionId: subscription.id,
    customerId: subscription.customer, tenantId: subscription.metadata.tenantId,
    planId: subscription.metadata.planId, terminal,
  });
}

export function assertRecurringCancellationProvider(
  candidate: RecurringCancellationCandidate, provider: unknown,
  ledger: RecurringCancellationLedger, latestSubscriptionId: string,
  liveMode: boolean,
): void {
  const sub = provider as any;
  if (liveMode || !candidate || !ledger || !sub ||
      !UUID.test(candidate.tenantId) || !UUID.test(candidate.planId) ||
      candidate.tenantId !== ledger.tenantId ||
      candidate.planId !== ledger.planId ||
      candidate.stripeSubscriptionId !== ledger.stripeSubscriptionId ||
      candidate.customerId !== ledger.stripeCustomerId ||
      ledger.subscriptionId !== latestSubscriptionId ||
      !['pending', 'active'].includes(ledger.bindingStatus) ||
      !['trialing', 'active', 'past_due', 'paused', 'canceled'].includes(ledger.localStatus) ||
      sub.object !== 'subscription' || sub.livemode !== false ||
      sub.id !== candidate.stripeSubscriptionId ||
      sub.customer !== candidate.customerId ||
      sub.metadata?.tenantId !== ledger.tenantId ||
      sub.metadata?.planId !== ledger.planId ||
      (candidate.terminal ? sub.status !== 'canceled' :
        (sub.cancel_at_period_end !== true ||
         !['active', 'trialing', 'past_due'].includes(sub.status))))
    throw new Error('Recurring cancellation is not verified for the current tenant');
  const page = sub.items;
  if (!page || !Array.isArray(page.data) || page.data.length !== 1 ||
      (page.has_more !== undefined && page.has_more !== false) ||
      (page.total_count !== undefined && page.total_count !== 1) ||
      page.data[0]?.quantity !== 1 ||
      (typeof page.data[0]?.price === 'string' ?
        page.data[0].price : page.data[0]?.price?.id) !== ledger.stripePriceId)
    throw new Error('Recurring cancellation price or pagination mismatch');
}

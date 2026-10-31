/**
 * C35: pure, fail-closed provider/tenant verification for TEST recurring
 * refunds and charge disputes. The signed event is only a candidate.
 * No access grant or database write is possible from this module.
 */
import type { StripePaymentException } from './stripe-policy';
import { recurringInvoicePaymentIntentId } from './stripe-recurring-payment-reference';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ref = (v: any): string | null =>
  typeof v === 'string' ? v : typeof v?.id === 'string' ? v.id : null;
const time = (v: unknown): number =>
  Number.isSafeInteger(v) && (v as number) > 0 ? (v as number) * 1000 : NaN;

export type RecurringReversalLedger = Readonly<{
  tenantId: string; subscriptionId: string; planId: string;
  stripeSubscriptionId: string; stripeCustomerId: string; stripePriceId: string;
  stripeInvoiceId: string; paymentIntentId: string;
  invoiceId: string; amountMinor: number; currency: string; periodEndsAt: string;
}>;

export function assertRecurringReversalProvider(
  event: StripePaymentException, intent: any, invoice: any, subscription: any,
  charge: any, dispute: any, ledger: RecurringReversalLedger,
  liveMode: boolean,
): { type: StripePaymentException['type']; amountMinor: number } {
  if (liveMode || !ledger || !UUID.test(ledger.tenantId) ||
      !UUID.test(ledger.subscriptionId) || !UUID.test(ledger.planId) ||
      !UUID.test(ledger.invoiceId) ||
      !/^sub_[A-Za-z0-9]+$/.test(ledger.stripeSubscriptionId) ||
      !/^cus_[A-Za-z0-9]+$/.test(ledger.stripeCustomerId) ||
      !/^price_[A-Za-z0-9]+$/.test(ledger.stripePriceId) ||
      !/^in_[A-Za-z0-9]+$/.test(ledger.stripeInvoiceId) ||
      !/^pi_[A-Za-z0-9]+$/.test(ledger.paymentIntentId) ||
      !Number.isSafeInteger(ledger.amountMinor) || ledger.amountMinor <= 0 ||
      !/^[A-Z]{3}$/.test(ledger.currency) ||
      !Number.isFinite(Date.parse(ledger.periodEndsAt)))
    throw new Error('Untrusted recurring reversal ledger');
  if (!event || !/^evt_[A-Za-z0-9]+$/.test(event.eventId) ||
      event.paymentIntent !== ledger.paymentIntentId ||
      event.currency !== ledger.currency ||
      !Number.isSafeInteger(event.amountMinor) || event.amountMinor <= 0 ||
      event.amountMinor > ledger.amountMinor ||
      !['full_refund', 'partial_refund', 'dispute_opened', 'dispute_closed'].includes(event.type))
    throw new Error('Reversal does not match settled recurring funds');
  if (!intent || intent.object !== 'payment_intent' || intent.livemode !== false ||
      intent.id !== ledger.paymentIntentId || intent.status !== 'succeeded' ||
      intent.amount !== ledger.amountMinor || intent.amount_received !== ledger.amountMinor ||
      intent.currency !== ledger.currency.toLowerCase() ||
      ref(intent.customer) !== ledger.stripeCustomerId ||
      ref(intent.invoice) !== ledger.stripeInvoiceId ||
      ref(intent.latest_charge) !== event.chargeId)
    throw new Error('PaymentIntent is not the captured recurring invoice payment');
  if (!invoice || invoice.object !== 'invoice' || invoice.livemode !== false ||
      invoice.id !== ledger.stripeInvoiceId || invoice.status !== 'paid' ||
      invoice.paid !== true || invoice.collection_method !== 'charge_automatically' ||
      !['subscription_create', 'subscription_cycle'].includes(invoice.billing_reason) ||
      ref(invoice.customer) !== ledger.stripeCustomerId ||
      ref(invoice.subscription ?? invoice.parent?.subscription_details?.subscription) !==
        ledger.stripeSubscriptionId ||
      (invoice.subscription != null && invoice.parent?.subscription_details?.subscription != null &&
       ref(invoice.subscription) !== ref(invoice.parent.subscription_details.subscription)) ||
      invoice.currency !== ledger.currency.toLowerCase() ||
      invoice.amount_paid !== ledger.amountMinor || invoice.amount_due !== ledger.amountMinor ||
      invoice.total !== ledger.amountMinor || invoice.amount_remaining !== 0 ||
      recurringInvoicePaymentIntentId(invoice) !== ledger.paymentIntentId)
    throw new Error('Provider invoice does not match immutable paid settlement');
  const lines = invoice.lines;
  if (!Array.isArray(lines?.data) || lines.data.length !== 1 ||
      (lines.has_more !== undefined && lines.has_more !== false) ||
      (lines.total_count !== undefined && lines.total_count !== 1))
    throw new Error('Incomplete or ambiguous recurring invoice lines');
  const line = lines.data[0];
  const oldPrice = ref(line?.price), newPrice = ref(line?.pricing?.price_details?.price);
  if (oldPrice && newPrice && oldPrice !== newPrice)
    throw new Error('Conflicting recurring invoice prices');
  if ((oldPrice ?? newPrice) !== ledger.stripePriceId ||
      line?.amount !== ledger.amountMinor || line?.quantity !== 1 ||
      line?.proration === true || (line?.type != null && line.type !== 'subscription') ||
      time(line?.period?.end) !== Date.parse(ledger.periodEndsAt))
    throw new Error('Invoice service line does not match settled period');
  // A historical refund can arrive after a newer renewal or cancellation.
  // Do not demand that the provider's latest_invoice is the old invoice.
  if (!subscription || subscription.object !== 'subscription' ||
      subscription.livemode !== false ||
      subscription.id !== ledger.stripeSubscriptionId ||
      ref(subscription.customer) !== ledger.stripeCustomerId ||
      subscription.metadata?.tenantId !== ledger.tenantId ||
      subscription.metadata?.planId !== ledger.planId)
    throw new Error('Provider subscription is not owned by this tenant');
  if (!charge || charge.object !== 'charge' || charge.livemode !== false ||
      charge.id !== event.chargeId || ref(charge.payment_intent) !== ledger.paymentIntentId ||
      charge.currency !== ledger.currency.toLowerCase() ||
      charge.amount !== ledger.amountMinor || charge.paid !== true ||
      charge.captured !== true ||
      (charge.customer != null && ref(charge.customer) !== ledger.stripeCustomerId) ||
      !Number.isSafeInteger(charge.amount_refunded) || charge.amount_refunded < 0 ||
      charge.amount_refunded > ledger.amountMinor)
    throw new Error('Provider charge does not match captured recurring funds');
  const isDispute = event.type.startsWith('dispute_');
  if (isDispute) {
    if (!dispute || dispute.object !== 'dispute' || dispute.livemode !== false ||
        dispute.id !== event.providerObjectId || ref(dispute.charge) !== charge.id ||
        ref(dispute.payment_intent) !== ledger.paymentIntentId ||
        dispute.amount !== event.amountMinor ||
        dispute.currency !== ledger.currency.toLowerCase() ||
        (event.type === 'dispute_opened' ?
          !['needs_response', 'under_review', 'warning_needs_response',
            'warning_under_review'].includes(dispute.status) :
          !['won', 'lost', 'warning_closed'].includes(dispute.status)))
      throw new Error('Dispute is not independently confirmed for this charge');
    return { type: event.type, amountMinor: event.amountMinor };
  }
  if (dispute != null || event.providerObjectId !== charge.id ||
      charge.amount_refunded < event.amountMinor ||
      (event.type === 'full_refund' && charge.amount_refunded !== ledger.amountMinor))
    throw new Error('Refund is not independently confirmed by the provider');
  // Refund events contain cumulative charge amounts. Reconcile the provider's
  // current total, so an older partial event cannot conceal a later full refund.
  return { type: charge.amount_refunded === ledger.amountMinor ?
    'full_refund' : 'partial_refund', amountMinor: charge.amount_refunded };
}

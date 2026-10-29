/** Pure, provider-independent billing constraints. No client can assert paymentConfirmed. */
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
export const REFERENCE_PROVIDER = 'reference_hmac';
/** The simulated settlement adapter must NEVER authorize a charge on a
 * staging or production deployment, even when NODE_ENV is accidentally unset.
 * It remains available only for explicitly enabled local development/tests.
 */
export function referenceBillingModeAllowed(nodeEnv: string | undefined,
  deploymentEnv: string | undefined): boolean {
  if (nodeEnv === 'production') return false;
  return deploymentEnv === undefined || deploymentEnv === '' || deploymentEnv === 'development';
}

export function sha256(bytes: Buffer | string) { return createHash('sha256').update(bytes).digest('hex'); }
export function nextPeriod(endsAt: string | Date, interval: string) {
  const start = new Date(endsAt);
  if (!Number.isFinite(start.getTime())) throw new Error('Invalid current period end');
  if (!['monthly', 'yearly'].includes(interval)) throw new Error('Invalid billing interval');
  const finish = new Date(start);
  // UTC calendar-month arithmetic, clamped to the final day where necessary.
  const day = finish.getUTCDate();
  finish.setUTCDate(1);
  if (interval === 'monthly') finish.setUTCMonth(finish.getUTCMonth() + 1);
  else finish.setUTCFullYear(finish.getUTCFullYear() + 1);
  const last = new Date(Date.UTC(finish.getUTCFullYear(), finish.getUTCMonth() + 1, 0)).getUTCDate();
  finish.setUTCDate(Math.min(day, last));
  return { startsAt: start.toISOString(), endsAt: finish.toISOString() };
}
export type BillingSubscription = { id: string; tenantId: string; status: string; periodEndsAt: string | Date; cancelAtPeriodEnd: boolean };
export type BillingInvoice = { id: string; tenantId: string; subscriptionId: string; status: string; amountMinor: number; currency: string; periodStartsAt: string | Date; periodEndsAt: string | Date };
export type SettlementEvent = { tenantId: string; invoiceId: string; amountMinor: number; currency: string };
export function mayInvoice(subscription: BillingSubscription | null, now: Date | string = new Date()) {
  if (!subscription || !['active', 'trialing'].includes(subscription.status)) return false;
  if (subscription.cancelAtPeriodEnd) return false;
  const end = new Date(subscription.periodEndsAt).getTime();
  return Number.isFinite(end) && end > new Date(now).getTime();
}
export function assertSettlement(invoice: BillingInvoice, event: SettlementEvent, subscription: BillingSubscription) {
  if (invoice.tenantId !== event.tenantId || invoice.id !== event.invoiceId)
    throw Error('Invoice/tenant mismatch');
  if (invoice.status !== 'open') throw Error('Invoice is not open');
  if (invoice.amountMinor !== event.amountMinor || invoice.currency !== event.currency)
    throw Error('Amount or currency mismatch');
  if (invoice.subscriptionId !== subscription.id || subscription.tenantId !== event.tenantId)
    throw Error('Subscription/tenant mismatch');
  if (!['active', 'trialing', 'past_due'].includes(subscription.status) || subscription.cancelAtPeriodEnd)
    throw Error('Subscription cannot be renewed');
  if (new Date(subscription.periodEndsAt).getTime() !== new Date(invoice.periodStartsAt).getTime())
    throw Error('Subscription period changed since invoicing');
  if (new Date(invoice.periodEndsAt).getTime() <= new Date(invoice.periodStartsAt).getTime())
    throw Error('Invalid billing period');
  return true;
}
export function verifyReferenceSignature(rawBody: Buffer | undefined, timestamp: unknown, signature: unknown, secret: string | undefined, now = Date.now()) {
  if (typeof secret !== 'string' || Buffer.byteLength(secret) < 32) return false;
  if (!Buffer.isBuffer(rawBody) || rawBody.length === 0 || rawBody.length > 16_384) return false;
  // Seconds since Unix epoch, within a five-minute replay window.
  if (typeof timestamp !== 'string' || !/^\d{10}$/.test(timestamp)) return false;
  const sentAt = Number(timestamp) * 1000;
  if (!Number.isFinite(sentAt) || Math.abs(now - sentAt) > 300_000) return false;
  if (typeof signature !== 'string' || !/^v1=[a-f0-9]{64}$/.test(signature)) return false;
  const expected = createHmac('sha256', secret).update(timestamp).update('.').update(rawBody).digest();
  const supplied = Buffer.from(signature.slice(3), 'hex');
  return supplied.length === expected.length && timingSafeEqual(expected, supplied);
}

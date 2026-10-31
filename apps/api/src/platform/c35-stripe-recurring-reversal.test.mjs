import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { parseStripePaymentException, verifyStripeSignature } from './stripe-policy.ts';
import { assertRecurringReversalProvider } from './stripe-recurring-reversal.ts';

const tenantId = '11111111-1111-4111-8111-111111111111';
const subscriptionId = '22222222-2222-4222-8222-222222222222';
const planId = '33333333-3333-4333-8333-333333333333';
const invoiceId = '44444444-4444-4444-8444-444444444444';
const start = 1793491200, end = 1796083200;
const ledger = { tenantId, subscriptionId, planId, invoiceId,
  stripeSubscriptionId: 'sub_C35', stripeCustomerId: 'cus_C35',
  stripePriceId: 'price_C35', stripeInvoiceId: 'in_C35',
  paymentIntentId: 'pi_C35', amountMinor: 12000, currency: 'SAR',
  periodEndsAt: new Date(end * 1000).toISOString() };
const intent = { object: 'payment_intent', id: 'pi_C35', livemode: false,
  status: 'succeeded', amount: 12000, amount_received: 12000,
  currency: 'sar', customer: 'cus_C35', invoice: 'in_C35', latest_charge: 'ch_C35' };
const invoice = { object: 'invoice', id: 'in_C35', livemode: false,
  status: 'paid', paid: true, collection_method: 'charge_automatically',
  billing_reason: 'subscription_cycle', subscription: 'sub_C35',
  customer: 'cus_C35', payment_intent: 'pi_C35',
  amount_due: 12000, amount_paid: 12000, amount_remaining: 0, total: 12000,
  currency: 'sar', lines: { data: [{ price: { id: 'price_C35' }, amount: 12000,
    quantity: 1, type: 'subscription', period: { start, end } }],
    has_more: false, total_count: 1 } };
const subscription = { object: 'subscription', id: 'sub_C35', livemode: false,
  customer: 'cus_C35', status: 'canceled',
  latest_invoice: 'in_NEWER', metadata: { tenantId, planId } };
const charge = { object: 'charge', id: 'ch_C35', livemode: false,
  payment_intent: 'pi_C35', amount: 12000, amount_refunded: 12000,
  currency: 'sar', paid: true, captured: true, customer: 'cus_C35' };
const dispute = { object: 'dispute', id: 'dp_C35', livemode: false,
  payment_intent: 'pi_C35', charge: 'ch_C35', amount: 12000,
  currency: 'sar', status: 'needs_response' };
const signed = (type, obj, eventId = 'evt_C35') => Buffer.from(JSON.stringify({
  id: eventId, type, livemode: false, data: { object: obj },
}));
const refund = parseStripePaymentException(signed('charge.refunded', charge), false);
const opened = parseStripePaymentException(signed('charge.dispute.created', dispute), false);
const check = (e = refund, i = intent, inv = invoice, sub = subscription,
  ch = charge, dp = null, l = ledger, mode = false) =>
  assertRecurringReversalProvider(e, i, inv, sub, ch, dp, l, mode);

test('signed TEST reversal requires Stripe HMAC before independent verification', () => {
  const raw = signed('charge.refunded', charge);
  const secret = 'whsec_12345678901234567890123456789012';
  const timestamp = 1793491200;
  const mac = createHmac('sha256', secret).update(String(timestamp))
    .update('.').update(raw).digest('hex');
  assert.equal(verifyStripeSignature(raw, 't=' + timestamp + ',v1=' + mac,
    secret, timestamp * 1000), true);
  assert.deepEqual(check(), { type: 'full_refund', amountMinor: 12000 });
  assert.throws(() => check(refund, intent, invoice, subscription, charge,
    null, ledger, true));
});

test('a delayed historical refund may be verified after subscription cancellation', () => {
  assert.deepEqual(check(), { type: 'full_refund', amountMinor: 12000 });
  assert.deepEqual(check(refund, intent, invoice,
    { ...subscription, latest_invoice: 'in_FUTURE' }),
    { type: 'full_refund', amountMinor: 12000 });
});

test('partial cumulative refund is not a full entitlement revocation', () => {
  const oldCharge = { ...charge, amount_refunded: 4000 };
  const oldEvent = parseStripePaymentException(
    signed('charge.refunded', oldCharge), false);
  assert.deepEqual(check(oldEvent, intent, invoice, subscription, oldCharge),
    { type: 'partial_refund', amountMinor: 4000 });
  // A newer complete provider refund supersedes a delayed partial event.
  assert.deepEqual(check(oldEvent), { type: 'full_refund', amountMinor: 12000 });
  assert.throws(() => check(refund, intent, invoice, subscription, oldCharge));
});

test('dispute open and close are independently verified and never auto-reactivate', () => {
  assert.deepEqual(check(opened, intent, invoice, subscription, charge, dispute),
    { type: 'dispute_opened', amountMinor: 12000 });
  const closed = { ...dispute, status: 'won' };
  const event = parseStripePaymentException(signed('charge.dispute.closed', closed), false);
  assert.deepEqual(check(event, intent, invoice, subscription, charge, closed),
    { type: 'dispute_closed', amountMinor: 12000 });
  assert.throws(() => check(opened, intent, invoice, subscription, charge, closed));
  assert.throws(() => check(opened, intent, invoice, subscription, charge,
    { ...dispute, charge: 'ch_OTHER' }));
});

test('cross-tenant, mismatched provider identities and unconfirmed funds fail closed', () => {
  for (const bad of [
    { ...ledger, tenantId: planId }, { ...ledger, paymentIntentId: 'pi_OTHER' },
    { ...ledger, stripeInvoiceId: 'in_OTHER' },
    { ...ledger, amountMinor: 11999 }, { ...ledger, periodEndsAt: 'invalid' },
  ]) assert.throws(() => check(refund, intent, invoice, subscription, charge, null, bad));
  for (const bad of [
    { ...intent, livemode: true }, { ...intent, invoice: 'in_OTHER' },
    { ...intent, latest_charge: 'ch_OTHER' }, { ...intent, amount_received: 0 },
    { ...intent, status: 'requires_payment_method' },
  ]) assert.throws(() => check(refund, bad));
  for (const bad of [
    { ...invoice, paid: false }, { ...invoice, amount_paid: 0 },
    { ...invoice, subscription: 'sub_OTHER' },
    { ...invoice, payments: { data: [], has_more: true } },
    { ...invoice, lines: { ...invoice.lines, has_more: true } },
    { ...invoice, lines: { data: [...invoice.lines.data, ...invoice.lines.data] } },
    { ...invoice, lines: { data: [{ ...invoice.lines.data[0],
      period: { start, end: end + 60 } }] } },
  ]) assert.throws(() => check(refund, intent, bad));
  for (const bad of [
    { ...subscription, metadata: { tenantId: planId, planId } },
    { ...subscription, customer: 'cus_OTHER' }, { ...subscription, livemode: true },
  ]) assert.throws(() => check(refund, intent, invoice, bad));
  for (const bad of [
    { ...charge, id: 'ch_OTHER' }, { ...charge, captured: false },
    { ...charge, paid: false }, { ...charge, amount: 5000 },
    { ...charge, amount_refunded: 13000 }, { ...charge, livemode: true },
  ]) assert.throws(() => check(refund, intent, invoice, subscription, bad));
});

test('webhook wiring remains signature-first, TEST-only, tenant-locked and receipt-idempotent', () => {
  const src = readFileSync(new URL('./stripe.service.ts', import.meta.url), 'utf8');
  const webhook = src.slice(src.indexOf('async webhook('));
  const method = src.slice(src.indexOf('private async recordRecurringPaymentException('),
    src.indexOf('private async handlePaymentException('));
  assert.ok(webhook.indexOf('verifyStripeSignature(rawBody, header') <
    webhook.indexOf('parseStripePaymentException(rawBody, config.liveMode)'));
  assert.match(src, /return this\.recordRecurringPaymentException\(event, digest, config, intent\)/);
  assert.match(method, /config\.liveMode \|\| process\.env\.DEPLOYMENT_ENV === 'production'/);
  assert.match(method, /withTenant\(tenantId, async tx =>/);
  assert.match(method, /pg_advisory_xact_lock/);
  assert.match(method, /FOR UPDATE OF b, s, i, pay/);
  assert.match(method, /assertRecurringReversalProvider/);
  assert.match(method, /billing_webhook_receipts/);
  assert.match(method, /billing_payment_exceptions/);
  assert.match(method, /shouldPauseOnPaymentException/);
  assert.doesNotMatch(method, /INSERT INTO billing_payments|SET status = 'active'/);
});

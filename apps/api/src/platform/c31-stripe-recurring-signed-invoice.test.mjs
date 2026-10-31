import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { verifyStripeSignature } from './stripe-policy.ts';
import { parsePaidRecurringInvoice } from './stripe-recurring-invoice.ts';
import { recurringInvoicePaymentIntentId } from './stripe-recurring-payment-reference.ts';

const secret = 'whsec_TEST12345678901234567890';
const base = {
  id: 'evt_TEST123', type: 'invoice.paid', livemode: false,
  data: { object: {
    object: 'invoice', id: 'in_TEST123', livemode: false, status: 'paid',
    paid: true, collection_method: 'charge_automatically',
    billing_reason: 'subscription_create', customer: 'cus_TEST123',
    subscription: 'sub_TEST123', amount_due: 12000, amount_paid: 12000,
    currency: 'sar', payment_intent: 'pi_TEST123',
    metadata: { tenantId: 'FORGED_DO_NOT_TRUST' },
  } },
};
const payload = (event = base) => Buffer.from(JSON.stringify(event));
const signed = (body, now = 1793450000000) => {
  const timestamp = Math.floor(now / 1000);
  const digest = createHmac('sha256', secret)
    .update(String(timestamp)).update('.').update(body).digest('hex');
  return { header: `t=${timestamp},v1=${digest}`, now };
};

test('scenario 1: signed TEST recurring invoice is a candidate, never a grant', () => {
  const body = payload();
  const signature = signed(body);
  assert.equal(verifyStripeSignature(body, signature.header, secret, signature.now), true);
  const candidate = parsePaidRecurringInvoice(body, false);
  assert.equal(candidate.invoiceId, 'in_TEST123');
  assert.equal(candidate.subscriptionId, 'sub_TEST123');
  assert.equal(recurringInvoicePaymentIntentId(base.data.object), 'pi_TEST123');
  assert.equal(Object.hasOwn(candidate, 'tenantId'), false);
});

test('scenario 2: tampered body fails raw Stripe signature', () => {
  const body = payload();
  const signature = signed(body);
  const changed = payload({ ...base, id: 'evt_TAMPERED' });
  assert.equal(verifyStripeSignature(changed, signature.header, secret, signature.now), false);
});

test('scenario 3: LIVE/TEST mismatch is rejected', () => {
  assert.throws(() => parsePaidRecurringInvoice(payload(), true));
  const altered = { ...base, livemode: true };
  assert.throws(() => parsePaidRecurringInvoice(payload(altered), false));
});

test('scenario 4: forged invoice tenant metadata cannot select a tenant', () => {
  const candidate = parsePaidRecurringInvoice(payload(), false);
  assert.equal(candidate.customerId, 'cus_TEST123');
  assert.equal('tenantId' in candidate, false);
});

test('scenario 5: incomplete or mismatched paid amount is rejected', () => {
  const invoice = base.data.object;
  for (const change of [{ amount_paid: 11999 }, { amount_due: 0 },
    { paid: false }, { status: 'open' }]) {
    assert.throws(() => parsePaidRecurringInvoice(payload({
      ...base, data: { object: { ...invoice, ...change } },
    }), false));
  }
});

test('scenario 6: incomplete Stripe invoice payment pagination fails closed', () => {
  const invoice = { ...base.data.object, payment_intent: null };
  const payment = { payment: { payment_intent: 'pi_TEST123' } };
  assert.equal(recurringInvoicePaymentIntentId({
    ...invoice, payments: { data: [payment], has_more: false, total_count: 1 },
  }), 'pi_TEST123');
  for (const payments of [
    { data: [payment], has_more: true },
    { data: [payment], total_count: 2 },
    { data: [payment, payment], has_more: false },
    { data: [] },
  ]) assert.throws(() => recurringInvoicePaymentIntentId({ ...invoice, payments }));
});

test('scenario 7: conflicting PaymentIntent references cannot settle', () => {
  const invoice = base.data.object;
  assert.throws(() => recurringInvoicePaymentIntentId({
    ...invoice, payments: {
      data: [{ payment: { payment_intent: 'pi_DIFFERENT' } }], has_more: false,
    },
  }));
  assert.throws(() => recurringInvoicePaymentIntentId({
    ...invoice, payment_intent: 'not_a_payment',
  }));
});

test('refund, cancellation and failed-payment events cannot parse as invoice grants', () => {
  for (const type of ['charge.refunded', 'customer.subscription.deleted',
    'invoice.payment_failed']) {
    assert.equal(parsePaidRecurringInvoice(payload({ ...base, type }), false), null);
  }
});

test('signed recurring paid webhook enters the TEST-only atomic settlement boundary', () => {
  const source = readFileSync(new URL('./stripe.service.ts', import.meta.url), 'utf8');
  const hook = source.slice(source.indexOf('async webhook('));
  assert.match(hook, /verifyStripeSignature\(rawBody, header/);
  assert.match(hook, /signedEnvelope\?\.type === 'invoice.paid'/);
  assert.match(hook, /parsePaidRecurringInvoice\(rawBody, config.liveMode\)/);
  assert.match(hook, /return this\.settleRecurringInvoice\(candidate, sha256\(rawBody\), config\)/);
  assert.match(hook, /Recurring Stripe settlement is TEST-only and disabled/);
});

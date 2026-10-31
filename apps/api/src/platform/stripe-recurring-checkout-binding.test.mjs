import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { verifyStripeSignature } from './stripe-policy.ts';
import { parseSignedRecurringCheckout, assertRecurringCheckoutBinding } from './stripe-recurring-checkout-binding.ts';

const tenantId = '11111111-1111-4111-8111-111111111111';
const subscriptionId = '22222222-2222-4222-8222-222222222222';
const planId = '33333333-3333-4333-8333-333333333333';
const session = {
  id: 'cs_test_C30ABC', object: 'checkout.session', livemode: false,
  mode: 'subscription', status: 'complete', payment_status: 'paid',
  client_reference_id: tenantId, metadata: { tenantId, planId },
  subscription: 'sub_C30ABC', customer: 'cus_C30ABC',
  amount_total: 12000, currency: 'sar',
};
const sub = {
  id: 'sub_C30ABC', object: 'subscription', livemode: false,
  customer: 'cus_C30ABC', status: 'active', cancel_at_period_end: false,
  metadata: { tenantId, planId },
  items: { data: [{ price: { id: 'price_C30ABC' }, quantity: 1 }],
    has_more: false, total_count: 1 },
};
const ledger = {
  tenantId, subscriptionId, planId, stripeSessionId: 'cs_test_C30ABC',
  stripePriceId: 'price_C30ABC', liveMode: false,
  priceMinor: 12000, currency: 'SAR',
};
const signed = (s = session, type = 'checkout.session.completed') =>
  Buffer.from(JSON.stringify({
    id: 'evt_C30ABC', type, livemode: false, data: { object: s },
  }));
const candidate = () => parseSignedRecurringCheckout(signed(), false);

test('signed recurring Checkout is only a tenant routing candidate', () => {
  const raw = signed();
  const secret = 'whsec_12345678901234567890123456789012';
  const timestamp = 1761900000;
  const sig = createHmac('sha256', secret)
    .update(String(timestamp)).update('.').update(raw).digest('hex');
  assert.equal(verifyStripeSignature(raw, `t=${timestamp},v1=${sig}`,
    secret, timestamp * 1000), true);
  assert.deepEqual(candidate(), {
    eventId: 'evt_C30ABC', sessionId: session.id, tenantId, planId,
    stripeSubscriptionId: sub.id, stripeCustomerId: 'cus_C30ABC',
  });
  assert.equal(parseSignedRecurringCheckout(signed({ ...session, mode: 'payment' }), false), null);
  assert.equal(parseSignedRecurringCheckout(signed(session, 'invoice.paid'), false), null);
});

test('independent provider GETs and tenant ledger produce a pending binding only', () => {
  assert.deepEqual(assertRecurringCheckoutBinding(candidate(), session, sub, ledger, false), {
    tenantId, subscriptionId, planId, stripeCheckoutSessionId: session.id,
    stripeSubscriptionId: sub.id, stripeCustomerId: 'cus_C30ABC',
    stripePriceId: 'price_C30ABC', eventId: 'evt_C30ABC',
  });
});

test('reject forged signed metadata, wrong mode and incomplete payment', () => {
  const variants = [
    { ...session, payment_status: 'unpaid' },
    { ...session, status: 'open' },
    { ...session, metadata: { tenantId: 'other', planId } },
    { ...session, subscription: 'sub_WRONG' },
    { ...session, livemode: true },
    { ...session, client_reference_id: 'other' },
  ];
  for (const s of variants)
    assert.throws(() => parseSignedRecurringCheckout(signed(s), false));
  assert.throws(() => parseSignedRecurringCheckout(signed(), true));
  assert.throws(() => parseSignedRecurringCheckout(Buffer.from('{bad'), false));
});

test('fail closed on provider mismatches, hidden prices and cross-tenant ownership', () => {
  const c = candidate();
  for (const remote of [
    { ...session, amount_total: 11999 },
    { ...session, subscription: 'sub_WRONG' },
    { ...session, metadata: { tenantId, planId: 'other' } },
    { ...session, currency: 'usd' },
  ]) assert.throws(() => assertRecurringCheckoutBinding(c, remote, sub, ledger, false));
  for (const remote of [
    { ...sub, status: 'past_due' },
    { ...sub, cancel_at_period_end: true },
    { ...sub, customer: 'cus_WRONG' },
    { ...sub, items: { ...sub.items, has_more: true } },
    { ...sub, items: { ...sub.items, data: [sub.items.data[0], sub.items.data[0]] } },
    { ...sub, items: { ...sub.items, data: [{ price: { id: 'price_WRONG' }, quantity: 1 }] } },
  ]) assert.throws(() => assertRecurringCheckoutBinding(c, session, remote, ledger, false));
  assert.throws(() => assertRecurringCheckoutBinding(c, session, sub,
    { ...ledger, tenantId: '44444444-4444-4444-8444-444444444444' }, false));
  assert.throws(() => assertRecurringCheckoutBinding(c, session, sub, ledger, true));
});

test('binding validator never grants entitlements or mutates a database', () => {
  const src = readFileSync(new URL('./stripe-recurring-checkout-binding.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /withTenant\(|UPDATE tenant_subscriptions|INSERT INTO billing_payments/);
  assert.match(src, /AFTER verification of the raw Stripe-Signature/);
});

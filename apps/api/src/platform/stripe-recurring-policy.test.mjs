import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertRecurringStripePrice, stripeRecurringCheckoutParams,
  stripeRecurringIdempotencyKey, assertCreatedRecurringCheckout,
} from './stripe-recurring-policy.ts';

const tenantId = '2bb4c19e-ac7d-47a3-8fa1-f917640e127a';
const planId = '72c72f05-c371-43c0-9f2a-9eb4b9945805';
const plan = { id: planId, code: 'pro', priceMinor: 12000, currency: 'SAR',
  billingInterval: 'monthly', trialDays: 0, isActive: true };
const price = { id: 'price_TEST123', object: 'price', active: true, livemode: false,
  type: 'recurring', billing_scheme: 'per_unit', currency: 'sar',
  unit_amount: 12000, unit_amount_decimal: '12000',
  recurring: { interval: 'month', interval_count: 1, usage_type: 'licensed' } };
const verified = assertRecurringStripePrice(price, plan, price.id, false);
const now = 1761900000000;
const session = { id: 'cs_test_ABC123', object: 'checkout.session', livemode: false,
  mode: 'subscription', status: 'open', payment_status: 'unpaid',
  subscription: null, amount_total: 12000, currency: 'sar',
  client_reference_id: tenantId, metadata: { tenantId, planId },
  expires_at: Math.floor(now / 1000) + 1800,
  url: 'https://checkout.stripe.com/c/pay/cs_test_ABC123#token' };

test('matching Stripe recurring Price is authorized', () => {
  assert.doesNotThrow(() => assertRecurringStripePrice(price, plan, price.id, false));
  assert.doesNotThrow(() => assertRecurringStripePrice({
    ...price, recurring: { ...price.recurring, interval: 'year' },
  }, { ...plan, billingInterval: 'yearly' }, price.id, false));
});

test('Price fails closed on amount, currency, interval, mode, activity and product type', () => {
  const variants = [
    { ...price, unit_amount: 12001 }, { ...price, currency: 'usd' },
    { ...price, active: false }, { ...price, livemode: true },
    { ...price, type: 'one_time' }, { ...price, billing_scheme: 'tiered' },
    { ...price, recurring: { ...price.recurring, interval: 'year' } },
    { ...price, recurring: { ...price.recurring, interval_count: 2 } },
    { ...price, recurring: { ...price.recurring, usage_type: 'metered' } },
    { ...price, id: 'price_OTHER' }, { ...price, unit_amount_decimal: '11999' },
  ];
  for (const variant of variants)
    assert.throws(() => assertRecurringStripePrice(variant, plan, price.id, false));
  for (const invalid of [{ ...plan, trialDays: 7 }, { ...plan, isActive: false },
    { ...plan, priceMinor: 0 }, { ...plan, currency: 'SAR!' }])
    assert.throws(() => assertRecurringStripePrice(price, invalid, price.id, false));
});

test('subscription Checkout uses server Price, never one-time amount or browser tenant', () => {
  const params = stripeRecurringCheckoutParams(plan, tenantId, verified, false,
    'https://theepmo.com/billing?billing=success',
    'https://theepmo.com/billing?billing=cancelled');
  assert.equal(params.get('mode'), 'subscription');
  assert.equal(params.get('line_items[0][price]'), price.id);
  assert.equal(params.get('line_items[0][quantity]'), '1');
  assert.equal(params.get('client_reference_id'), tenantId);
  assert.equal(params.get('metadata[planId]'), planId);
  assert.equal(params.get('subscription_data[metadata][tenantId]'), tenantId);
  assert.equal(params.has('payment_intent_data[metadata][tenantId]'), false);
  assert.equal(params.has('line_items[0][price_data][unit_amount]'), false);
});

test('Checkout rejects untrusted redirect destinations', () => {
  for (const success of [
    'http://theepmo.com/billing', 'https://theepmo.com.evil.test/billing',
    'https://user:pass@theepmo.com/billing',
    'https://theepmo.com/billing#fragment',
    'javascript:alert(1)',
  ]) {
    if (success === 'https://theepmo.com.evil.test/billing') {
      assert.throws(() => stripeRecurringCheckoutParams(plan, tenantId, verified, false,
        success, 'https://theepmo.com/billing'));
    } else {
      assert.throws(() => stripeRecurringCheckoutParams(plan, tenantId, verified, false,
        success, 'https://theepmo.com/billing'));
    }
  }
});

test('forged, unverified or wrong-mode Stripe Price tokens cannot initiate Checkout', () => {
  assert.throws(() => stripeRecurringCheckoutParams(plan, tenantId,
    { priceId: price.id, planId, liveMode: false }, false,
    'https://theepmo.com/billing', 'https://theepmo.com/billing'));
  assert.throws(() => stripeRecurringCheckoutParams(plan, tenantId, verified, true,
    'https://theepmo.com/billing', 'https://theepmo.com/billing'));
});

test('Stripe subscription Checkout response is session-bound and still unpaid', () => {
  assert.deepEqual(assertCreatedRecurringCheckout(session, plan, tenantId, false, now),
    { sessionId: session.id, url: session.url });
});

test('wrong or already-paid subscription sessions cannot be returned', () => {
  const variants = [
    { ...session, mode: 'payment' }, { ...session, status: 'complete' },
    { ...session, payment_status: 'paid' }, { ...session, subscription: 'sub_ABC' },
    { ...session, id: 'cs_live_ABC123' }, { ...session, livemode: true },
    { ...session, amount_total: 11999 }, { ...session, currency: 'usd' },
    { ...session, client_reference_id: planId },
    { ...session, metadata: { tenantId: planId, planId } },
    { ...session, metadata: { tenantId, planId: tenantId } },
    { ...session, expires_at: Math.floor(now / 1000) + 59 },
    { ...session, url: 'https://checkout.stripe.com/c/pay/cs_test_OTHER' },
    { ...session, url: 'https://checkout.stripe.com.evil.test/c/pay/cs_test_ABC123' },
  ];
  for (const variant of variants)
    assert.throws(() => assertCreatedRecurringCheckout(variant, plan, tenantId, false, now));
});

test('recurring Checkout retries have tenant- and plan-bound keys', () => {
  assert.equal(stripeRecurringIdempotencyKey(tenantId, planId, 0),
    stripeRecurringIdempotencyKey(tenantId, planId, 0));
  assert.notEqual(stripeRecurringIdempotencyKey(tenantId, planId, 0),
    stripeRecurringIdempotencyKey(tenantId, planId, 1));
  assert.throws(() => stripeRecurringIdempotencyKey(tenantId, planId, -1));
  assert.throws(() => stripeRecurringIdempotencyKey(tenantId, planId, 1.5));
  assert.throws(() => stripeRecurringIdempotencyKey('invalid', planId, 0));
});

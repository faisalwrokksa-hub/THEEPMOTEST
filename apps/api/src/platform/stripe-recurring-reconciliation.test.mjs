import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assertRecurringProviderSettlement } from './stripe-recurring-reconciliation.ts';

const tenantId = '2bb4c19e-ac7d-47a3-8fa1-f917640e127a';
const subscriptionId = 'b2c9d9ab-cf27-4c33-9a60-0b9182bca0d2';
const planId = '72c72f05-c371-43c0-9f2a-9eb4b9945805';
const plan = { id: planId, code: 'pro', priceMinor: 12000, currency: 'SAR',
  billingInterval: 'monthly', trialDays: 0, isActive: true };
const start = 1793491200; // 2026-11-01 UTC
const end = 1796083200; // 2026-12-01 UTC
const binding = { tenantId, subscriptionId, planId, stripeSubscriptionId: 'sub_TEST123',
  stripeCustomerId: 'cus_TEST123', stripePriceId: 'price_TEST123',
  status: 'pending', lastPeriodEndsAt: null, cancelAtPeriodEnd: false };
const candidate = { eventId: 'evt_TEST123', invoiceId: 'in_TEST123',
  subscriptionId: 'sub_TEST123', customerId: 'cus_TEST123',
  amountMinor: 12000, currency: 'SAR', billingReason: 'subscription_create' };
const invoice = { object: 'invoice', id: 'in_TEST123', livemode: false, status: 'paid',
  paid: true, collection_method: 'charge_automatically', billing_reason: 'subscription_create',
  customer: 'cus_TEST123', subscription: 'sub_TEST123',
  currency: 'sar', amount_due: 12000, amount_paid: 12000,
  total: 12000, amount_remaining: 0, payment_intent: 'pi_TEST123',
  metadata: { tenantId: 'FORGED-DO-NOT-TRUST' },
  lines: { data: [{ type: 'subscription', price: { id: 'price_TEST123' },
    quantity: 1, amount: 12000, proration: false, period: { start, end } }] } };
const subscription = { object: 'subscription', id: 'sub_TEST123', livemode: false,
  customer: 'cus_TEST123', status: 'active', cancel_at_period_end: false,
  latest_invoice: 'in_TEST123', metadata: { tenantId, planId },
  items: { data: [{ price: { id: 'price_TEST123' }, quantity: 1 }] } };
const intent = { object: 'payment_intent', id: 'pi_TEST123', livemode: false,
  status: 'succeeded', amount_received: 12000, currency: 'sar',
  customer: 'cus_TEST123', invoice: 'in_TEST123' };
const verify = (c = candidate, i = invoice, s = subscription, p = intent,
  b = binding, pl = plan, live = false) =>
  assertRecurringProviderSettlement(c, i, s, p, b, pl, live);

test('provider-confirmed initial invoice is a non-mutating settlement candidate', () => {
  assert.deepEqual(verify(), {
    tenantId, subscriptionId, planId, stripeInvoiceId: 'in_TEST123',
    stripeSubscriptionId: 'sub_TEST123', paymentIntentId: 'pi_TEST123',
    eventId: 'evt_TEST123', amountMinor: 12000, currency: 'SAR',
    periodStartsAt: new Date(start * 1000).toISOString(),
    periodEndsAt: new Date(end * 1000).toISOString(),
  });
});

test('renewal must be contiguous and belong to the existing active subscription', () => {
  const renewal = { ...candidate, billingReason: 'subscription_cycle' };
  const paid = { ...invoice, billing_reason: 'subscription_cycle' };
  const active = { ...binding, status: 'active', lastPeriodEndsAt: new Date(start * 1000).toISOString() };
  assert.equal(verify(renewal, paid, subscription, intent, active).paymentIntentId, 'pi_TEST123');
  for (const b of [
    { ...active, lastPeriodEndsAt: new Date((start + 86400) * 1000).toISOString() },
    { ...active, status: 'pending' },
    { ...active, cancelAtPeriodEnd: true },
    { ...active, stripeCustomerId: 'cus_WRONG' },
    { ...active, stripeSubscriptionId: 'sub_WRONG' },
    { ...active, tenantId: planId },
  ]) assert.throws(() => verify(renewal, paid, subscription, intent, b));
  assert.throws(() => verify(renewal, paid, subscription, intent, binding));
});

test('wrong provider invoice, signed candidate or payment amounts cannot settle', () => {
  for (const change of [
    { id: 'in_OTHER' }, { livemode: true }, { paid: false }, { status: 'open' },
    { collection_method: 'send_invoice' }, { billing_reason: 'manual' },
    { customer: 'cus_OTHER' }, { subscription: 'sub_OTHER' },
    { currency: 'usd' }, { amount_due: 11999 }, { amount_paid: 11999 },
    { total: 11999 }, { amount_remaining: 1 },
    { payment_intent: 'pi_OTHER' },
  ]) assert.throws(() => verify(candidate, { ...invoice, ...change }));
  for (const change of [
    { eventId: 'evt_bad-!' }, { subscriptionId: 'sub_OTHER' },
    { customerId: 'cus_OTHER' }, { amountMinor: 1 },
    { currency: 'USD' }, { billingReason: 'subscription_cycle' },
  ]) assert.throws(() => verify({ ...candidate, ...change }));
});

test('invoice and subscription cannot hide extra prices, quantities or prorations', () => {
  const line = invoice.lines.data[0];
  for (const change of [
    { price: { id: 'price_OTHER' } }, { quantity: 2 },
    { amount: 1 }, { proration: true },
    { period: { start, end: start } },
    { period: { start, end: end + 86400 * 90 } },
  ]) assert.throws(() => verify(candidate, {
    ...invoice, lines: { data: [{ ...line, ...change }] },
  }));
  assert.throws(() => verify(candidate, { ...invoice, lines: { data: [line, line] } }));
  assert.throws(() => verify(candidate, invoice, {
    ...subscription, items: { data: [...subscription.items.data, ...subscription.items.data] },
  }));
  assert.throws(() => verify(candidate, invoice, {
    ...subscription, items: { data: [{ ...subscription.items.data[0], quantity: 2 }] },
  }));
});

test('subscription must be active, current, uncanceled and bound to stored tenant', () => {
  for (const change of [
    { livemode: true }, { status: 'past_due' }, { cancel_at_period_end: true },
    { customer: 'cus_OTHER' }, { latest_invoice: 'in_OTHER' },
    { metadata: { tenantId: 'OTHER', planId } },
    { metadata: { tenantId, planId: 'OTHER' } },
  ]) assert.throws(() => verify(candidate, invoice, { ...subscription, ...change }));
});

test('independent captured PaymentIntent and invoice payment references must agree', () => {
  for (const change of [
    { livemode: true }, { status: 'processing' }, { amount_received: 11999 },
    { currency: 'usd' }, { customer: 'cus_OTHER' },
    { invoice: 'in_OTHER' }, { id: 'pi_OTHER' },
  ]) assert.throws(() => verify(candidate, invoice, subscription, { ...intent, ...change }));
  assert.throws(() => verify(candidate, { ...invoice, payment_intent: null }));
  assert.throws(() => verify(candidate, { ...invoice, payments: { data: [
    { payment: { payment_intent: 'pi_TEST123' } }, { payment: { payment_intent: 'pi_TEST123' } },
  ] } }));
  assert.equal(verify(candidate, {
    ...invoice, payment_intent: null,
    payments: { data: [{ payment: { payment_intent: 'pi_TEST123' } }] },
  }).paymentIntentId, 'pi_TEST123');
  assert.throws(() => verify(candidate, {
    ...invoice, payments: { data: [{ payment: { payment_intent: 'pi_OTHER' } }] },
  }));
});

test('Stripe pagination and conflicting price representations fail closed', () => {
  const line = invoice.lines.data[0];
  const item = subscription.items.data[0];
  const payment = { payment: { payment_intent: 'pi_TEST123' } };
  for (const page of [
    { data: [line], has_more: true },
    { data: [line], has_more: 'false' },
    { data: [line], total_count: 2 },
  ]) assert.throws(() => verify(candidate, { ...invoice, lines: page }));
  for (const page of [
    { data: [item], has_more: true },
    { data: [item], total_count: 2 },
  ]) assert.throws(() => verify(candidate, invoice, { ...subscription, items: page }));
  for (const page of [
    { data: [payment], has_more: true },
    { data: [payment], total_count: 2 },
    { data: [], has_more: false },
    { data: [payment, payment], has_more: false },
    { data: 'not-a-list' },
  ]) assert.throws(() => verify(candidate, { ...invoice, payments: page }));
  assert.throws(() => verify(candidate, {
    ...invoice, lines: { data: [{ ...line,
      pricing: { price_details: { price: 'price_DIFFERENT' } } }] },
  }));
  assert.equal(verify(candidate, {
    ...invoice, lines: { data: [{ ...line,
      pricing: { price_details: { price: 'price_TEST123' } } }], has_more: false },
    payments: { data: [payment], has_more: false, total_count: 1 },
  }).paymentIntentId, 'pi_TEST123');
});

test('no DB writes, tenant inference or entitlement grant occurs in the verifier', () => {
  const source = readFileSync(new URL('./stripe-recurring-reconciliation.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /withTenant\(|UPDATE tenant_subscriptions|INSERT INTO billing_payments/);
  assert.match(source, /already persisted/);
  assert.match(source, /NEVER creates Checkout/);
});

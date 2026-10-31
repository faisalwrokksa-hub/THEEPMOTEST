import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { verifyStripeSignature } from './stripe-policy.ts';
import { parseRecurringCancellation, assertRecurringCancellationProvider } from './stripe-recurring-cancellation.ts';

const tenantId = '11111111-1111-4111-8111-111111111111';
const subscriptionId = '22222222-2222-4222-8222-222222222222';
const planId = '33333333-3333-4333-8333-333333333333';
const sub = {
  object: 'subscription', id: 'sub_C33ABC', livemode: false,
  customer: 'cus_C33ABC', status: 'canceled', cancel_at_period_end: false,
  metadata: { tenantId, planId },
  items: { data: [{ price: { id: 'price_C33ABC' }, quantity: 1 }],
    has_more: false, total_count: 1 },
};
const ledger = {
  tenantId, subscriptionId, planId, stripeSubscriptionId: sub.id,
  stripeCustomerId: sub.customer, stripePriceId: 'price_C33ABC',
  bindingStatus: 'active', localStatus: 'active',
};
const signed = (object = sub, type = 'customer.subscription.deleted', eventId = 'evt_C33ABC') =>
  Buffer.from(JSON.stringify({ id: eventId, type, livemode: false, data: { object } }));
const parse = (object = sub, type, eventId) =>
  parseRecurringCancellation(signed(object, type, eventId), false);

test('verified Stripe TEST signature precedes terminal cancellation candidate', () => {
  const raw = signed();
  const secret = 'whsec_12345678901234567890123456789012';
  const timestamp = 1761900000;
  const signature = createHmac('sha256', secret)
    .update(String(timestamp)).update('.').update(raw).digest('hex');
  assert.equal(verifyStripeSignature(raw, `t=${timestamp},v1=${signature}`,
    secret, timestamp * 1000), true);
  assert.deepEqual(parse(), {
    eventId: 'evt_C33ABC', stripeSubscriptionId: sub.id,
    customerId: sub.customer, tenantId, planId, terminal: true,
  });
  assert.doesNotThrow(() =>
    assertRecurringCancellationProvider(parse(), sub, ledger, subscriptionId, false));
});

test('scheduled end-of-period cancellation preserves paid access until expiration', () => {
  const scheduled = { ...sub, status: 'active', cancel_at_period_end: true };
  const candidate = parse(scheduled, 'customer.subscription.updated');
  assert.equal(candidate.terminal, false);
  assert.doesNotThrow(() =>
    assertRecurringCancellationProvider(candidate, scheduled, ledger, subscriptionId, false));
  assert.equal(parseRecurringCancellation(signed({ ...scheduled, cancel_at_period_end: false },
    'customer.subscription.updated'), false), null);
});

test('reject forged tenant, mode, status and customer cancellation signals', () => {
  for (const changed of [
    { ...sub, livemode: true },
    { ...sub, customer: 'bad' },
    { ...sub, status: 'active' },
    { ...sub, id: 'bad' },
  ]) assert.throws(() => parse(changed));
  assert.throws(() => parseRecurringCancellation(signed(), true));
  assert.throws(() => parseRecurringCancellation(Buffer.from('{'), false));
  assert.throws(() => parse(sub, 'customer.subscription.deleted', 'invalid'));
});

test('provider GET and immutable ledger must match tenant, customer, plan and price', () => {
  const c = parse();
  for (const bad of [
    { ...sub, livemode: true },
    { ...sub, status: 'active' },
    { ...sub, customer: 'cus_OTHER' },
    { ...sub, metadata: { tenantId: planId, planId } },
    { ...sub, items: { ...sub.items, has_more: true } },
    { ...sub, items: { ...sub.items, total_count: 2 } },
    { ...sub, items: { data: [...sub.items.data, ...sub.items.data] } },
    { ...sub, items: { data: [{ price: { id: 'price_OTHER' }, quantity: 1 }] } },
  ]) assert.throws(() =>
    assertRecurringCancellationProvider(c, bad, ledger, subscriptionId, false));
  for (const bad of [
    { ...ledger, tenantId: planId },
    { ...ledger, planId: tenantId },
    { ...ledger, stripeCustomerId: 'cus_OTHER' },
    { ...ledger, bindingStatus: 'unknown' },
  ]) assert.throws(() =>
    assertRecurringCancellationProvider(c, sub, bad, subscriptionId, false));
  assert.throws(() => assertRecurringCancellationProvider(c, sub, ledger, planId, false));
  assert.throws(() => assertRecurringCancellationProvider(c, sub, ledger, subscriptionId, true));
});

test('webhook cancellation uses tenant lock, verified provider and replay digest; no grant', () => {
  const src = readFileSync(new URL('./stripe.service.ts', import.meta.url), 'utf8');
  const webhook = src.slice(src.indexOf('async webhook('));
  const method = src.slice(src.indexOf('private async recordRecurringCancellation('),
    src.indexOf('private async settleRecurringInvoice('));
  assert.ok(webhook.indexOf('verifyStripeSignature(rawBody, header') <
    webhook.indexOf('parseRecurringCancellation(rawBody, config.liveMode)'));
  assert.match(webhook, /return this.recordRecurringCancellation\(cancellation, sha256\(rawBody\), config\)/);
  assert.match(method, /config.liveMode \|\| process.env.DEPLOYMENT_ENV === 'production'/);
  assert.match(method, /stripeApiFetch/);
  assert.match(method, /subscriptions\/\$\{candidate.stripeSubscriptionId\}/);
  assert.match(method, /withTenant\(tenantId, async tx =>/);
  assert.match(method, /pg_advisory_xact_lock/);
  assert.match(method, /FOR UPDATE OF b, s/);
  assert.match(method, /assertRecurringCancellationProvider/);
  assert.match(method, /payloadSha256/);
  assert.match(method, /UPDATE tenant_subscriptions/);
  assert.match(method, /UPDATE billing_stripe_recurring_bindings/);
  assert.doesNotMatch(method, /SET status = 'active'|INSERT INTO billing_payments/);
  assert.match(webhook, /return this\.recordRecurringFailedInvoice\(failedCandidate, sha256\(rawBody\), config\)/);
});

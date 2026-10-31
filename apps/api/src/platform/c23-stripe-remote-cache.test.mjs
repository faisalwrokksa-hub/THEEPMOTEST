import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripeCachedCheckoutDisposition, stripeCheckoutIdempotencyKey } from './stripe-policy.ts';

const invoiceId = 'ae6c076e-c4fe-4cb0-9eda-476ea8d59024';
const tenantId = '2bb4c19e-ac7d-47a3-8fa1-f917640e127a';
const sessionId = 'cs_test_REMOTE123';
const expected = { sessionId, invoiceId, tenantId, amountMinor: 12000, currency: 'SAR', liveMode: false };
const now = 1793433600000;
const session = { object: 'checkout.session', id: sessionId, livemode: false, mode: 'payment',
  status: 'open', payment_status: 'unpaid', payment_intent: null, amount_total: 12000,
  currency: 'sar', client_reference_id: invoiceId, metadata: { invoiceId, tenantId },
  expires_at: Math.floor(now / 1000) + 1800,
  url: `https://checkout.stripe.com/c/pay/${sessionId}#stripe` };

test('Stripe-confirmed open unpaid cached session is reusable', () => {
  assert.equal(stripeCachedCheckoutDisposition(session, expected, now), 'reusable');
});
test('Stripe-confirmed expiration creates a distinct retry attempt', () => {
  assert.equal(stripeCachedCheckoutDisposition({ ...session, status: 'expired',
    expires_at: Math.floor(now / 1000) - 1 }, expected, now), 'expired');
  assert.notEqual(stripeCheckoutIdempotencyKey(invoiceId, 0), stripeCheckoutIdempotencyKey(invoiceId, 1));
});
test('completed paid and asynchronous unpaid sessions must await reconciliation', () => {
  for (const payment_status of ['paid', 'unpaid', 'no_payment_required']) {
    assert.equal(stripeCachedCheckoutDisposition({ ...session, status: 'complete', payment_status }, expected, now),
      'pending_settlement');
  }
});
test('mismatched remote invoice, tenant, amount, currency or TEST/LIVE state fails closed', () => {
  for (const changed of [
    null, {}, { ...session, id: 'cs_test_OTHER' }, { ...session, livemode: true },
    { ...session, metadata: { ...session.metadata, tenantId: invoiceId } },
    { ...session, metadata: { ...session.metadata, invoiceId: tenantId } },
    { ...session, client_reference_id: tenantId }, { ...session, amount_total: 11999 },
    { ...session, currency: 'usd' }, { ...session, mode: 'subscription' },
    { ...session, url: 'https://checkout.stripe.com/c/pay/cs_test_OTHER' },
    { ...session, payment_intent: 'pi_ALREADY' },
    { ...session, expires_at: Math.floor(now / 1000) + 20 },
    { ...session, status: 'expired', payment_status: 'paid' },
  ]) assert.throws(() => stripeCachedCheckoutDisposition(changed, expected, now));
});
test('cached Checkout cannot be returned without a direct Stripe status lookup', () => {
  const source = readFileSync(new URL('./stripe.service.ts', import.meta.url), 'utf8');
  const cache = source.slice(source.indexOf('if (existing) {'), source.indexOf('// Stripe caches requests by idempotency key.'));
  assert.match(cache, /stripeApiFetch\(/);
  assert.match(cache, /v1\/checkout\/sessions\/\$\{existing\.sessionId\}/);
  assert.match(cache, /stripeCachedCheckoutDisposition\(remoteSession/);
  assert.match(cache, /disposition === 'pending_settlement'/);
  assert.match(cache, /disposition === 'reusable'/);
  assert.ok(cache.indexOf('stripeCachedCheckoutDisposition(remoteSession') < cache.indexOf('return { invoiceId'));
  assert.doesNotMatch(cache, /UPDATE billing_stripe_checkout_sessions/);
});

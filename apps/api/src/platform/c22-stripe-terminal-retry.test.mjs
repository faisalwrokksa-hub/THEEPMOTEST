import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseUnpaidStripeCheckoutEvent, stripeCheckoutIdempotencyKey } from './stripe-policy.ts';

const tenantId = '2bb4c19e-ac7d-47a3-8fa1-f917640e127a';
const invoiceId = 'ae6c076e-c4fe-4cb0-9eda-476ea8d59024';
const session = {
  object: 'checkout.session', id: 'cs_test_RETRY123', livemode: false,
  mode: 'payment', payment_status: 'unpaid', status: 'expired',
  amount_total: 12000, currency: 'sar', client_reference_id: invoiceId,
  metadata: { tenantId, invoiceId },
};
const signedEventBody = (type, status) => Buffer.from(JSON.stringify({
  id: 'evt_RETRY123', type, livemode: false,
  data: { object: { ...session, status } },
}));

test('signed expired Checkout is terminal, not a reusable payment destination', () => {
  const parsed = parseUnpaidStripeCheckoutEvent(
    signedEventBody('checkout.session.expired', 'expired'), false);
  assert.equal(parsed?.reason, 'expired');
  assert.equal(parsed?.session.id, session.id);
});

test('signed async payment failure is terminal even before original expiry', () => {
  const parsed = parseUnpaidStripeCheckoutEvent(
    signedEventBody('checkout.session.async_payment_failed', 'complete'), false);
  assert.equal(parsed?.reason, 'async_payment_failed');
  assert.equal(parsed?.session.id, session.id);
  assert.notEqual(stripeCheckoutIdempotencyKey(invoiceId, 0),
    stripeCheckoutIdempotencyKey(invoiceId, 1));
});

test('cached Checkout query excludes terminal session using same-tenant append-only evidence', () => {
  const source = readFileSync(new URL('./stripe.service.ts', import.meta.url), 'utf8');
  const begin = source.indexOf('const existing = rows(await tx.execute(sql`');
  const end = source.indexOf('if (existing) {', begin);
  assert.ok(begin >= 0 && end > begin, 'cached Checkout lookup exists');
  const query = source.slice(begin, end);
  assert.match(query, /NOT EXISTS\s*\(/);
  assert.match(query, /FROM subscription_events e/);
  assert.match(query, /e\.tenant_id = s\.tenant_id/);
  assert.ok(query.includes('e.subscription_id = ${invoice.subscriptionId}'));
  assert.match(query, /e\.event_type = 'billing\.stripe_checkout_unpaid'/);
  assert.match(query, /e\.details ->> 'stripeSessionId' = s\.stripe_session_id/);
  assert.match(query, /s\.expires_at > now\(\)/);
  const unpaid = source.slice(source.indexOf('private async recordUnpaidCheckout('),
    source.indexOf('private async recordUnfulfilledSettlement('));
  assert.match(unpaid, /INSERT INTO subscription_events/);
  assert.match(unpaid, /'billing\.stripe_checkout_unpaid'/);
  assert.match(unpaid, /stripeSessionId: session\.id/);
  assert.doesNotMatch(source, /UPDATE billing_stripe_checkout_sessions/i);
});

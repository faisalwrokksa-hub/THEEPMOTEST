import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { parseUnpaidStripeCheckoutEvent, parsePaidStripeEvent, verifyStripeSignature } from './stripe-policy.ts';

const tenantId = '2bb4c19e-ac7d-47a3-8fa1-f917640e127a';
const invoiceId = 'ae6c076e-c4fe-4cb0-9eda-476ea8d59024';
const session = {
  id: 'cs_test_ABC123', object: 'checkout.session', livemode: false,
  mode: 'payment', status: 'complete', payment_status: 'unpaid',
  amount_total: 12000, currency: 'sar', payment_intent: null,
  client_reference_id: invoiceId, metadata: { tenantId, invoiceId },
};
const event = (type, object = session, livemode = false) => Buffer.from(JSON.stringify({
  id: 'evt_UNPAID123', type, livemode, data: { object },
}));

test('signed asynchronous failure is recognized without a paid settlement', () => {
  const raw = event('checkout.session.async_payment_failed');
  const secret = 'whsec_12345678901234567890123456789012';
  const timestamp = 1761436800;
  const signature = createHmac('sha256', secret).update(String(timestamp)).update('.').update(raw).digest('hex');
  assert.equal(verifyStripeSignature(raw, `t=${timestamp},v1=${signature}`, secret, timestamp * 1000), true);
  assert.deepEqual(parseUnpaidStripeCheckoutEvent(raw, false)?.reason, 'async_payment_failed');
  assert.equal(parsePaidStripeEvent(raw, false), null);
});

test('expired Checkout is audited but never treated as payment', () => {
  const raw = event('checkout.session.expired', { ...session, status: 'expired' });
  assert.equal(parseUnpaidStripeCheckoutEvent(raw, false)?.reason, 'expired');
  assert.equal(parsePaidStripeEvent(raw, false), null);
});

test('unrelated signed events are not treated as unpaid Checkout', () => {
  assert.equal(parseUnpaidStripeCheckoutEvent(event('checkout.session.completed'), false), null);
});

test('unpaid Checkout rejects mismatched mode, identity and invoice metadata', () => {
  const cases = [
    { ...session, livemode: true },
    { ...session, id: 'cs_live_ABC123' },
    { ...session, metadata: { tenantId: invoiceId, invoiceId } , client_reference_id: tenantId },
    { ...session, client_reference_id: tenantId },
    { ...session, amount_total: 0 },
    { ...session, currency: 'usd!' },
    { ...session, status: 'expired' },
    { ...session, payment_status: 'paid' },
  ];
  for (const changed of cases)
    assert.throws(() => parseUnpaidStripeCheckoutEvent(event('checkout.session.async_payment_failed', changed), false));
  assert.throws(() => parseUnpaidStripeCheckoutEvent(event('checkout.session.expired', session), false));
  assert.throws(() => parseUnpaidStripeCheckoutEvent(event('checkout.session.expired', { ...session, status: 'expired' }, true), false));
});

test('failure receipt is tenant-bound, idempotent, and never mutates financial state', () => {
  const service = readFileSync(new URL('./stripe.service.ts', import.meta.url), 'utf8');
  const start = service.indexOf('private async recordUnpaidCheckout(');
  const end = service.indexOf('/** Captured funds after cancellation/voiding', start);
  assert.ok(start > 0 && end > start);
  const handler = service.slice(start, end);
  assert.match(handler, /pg_advisory_xact_lock/);
  assert.match(handler, /s\.stripe_session_id = \$\{session\.id\}/);
  assert.match(handler, /matched\.amountMinor !== session\.amount_total/);
  assert.match(handler, /matched\.currency !== session\.currency!/);
  assert.match(handler, /ON CONFLICT \(provider, provider_event_id\) DO NOTHING/);
  assert.match(handler, /duplicate\.digest !== digest/);
  assert.match(handler, /billing\.stripe_checkout_unpaid/);
  assert.doesNotMatch(handler, /UPDATE tenant_subscriptions|UPDATE billing_invoices|INSERT INTO billing_payments/);
  assert.match(service, /if \(unpaidEvent\) return this\.recordUnpaidCheckout\(unpaidEvent, digest\)/);
});

import test from 'node:test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { parseStripePaymentException, assertStripeExceptionIntent,
  shouldPauseOnPaymentException, refundCoversPaidInvoice, stripeCheckoutParams, assertStripePaymentInvoiceMatch } from './stripe-policy.ts';
const tenantId = '2bb4c19e-ac7d-47a3-8fa1-f917640e127a';
const invoiceId = 'ae6c076e-c4fe-4cb0-9eda-476ea8d59024';
const subscriptionId = '72c72f05-c371-43c0-9f2a-9eb4b9945805';
const charge = { object: 'charge', id: 'ch_123', payment_intent: 'pi_123',
  currency: 'sar', amount: 12000, amount_refunded: 12000 };
const dispute = { object: 'dispute', id: 'dp_123', payment_intent: 'pi_123',
  currency: 'sar', amount: 12000, status: 'needs_response' };
const event = (type, object, live = false) => Buffer.from(JSON.stringify({ id: 'evt_123',
  livemode: live, type, data: { object } }));
const intent = { object: 'payment_intent', id: 'pi_123', livemode: false,
  amount: 12000, currency: 'sar', status: 'succeeded', metadata: { tenantId, invoiceId } };
const invoice = { id: invoiceId, tenantId, subscriptionId, amountMinor: 12000, currency: 'SAR',
  periodEndsAt: '2026-12-01' };
const session = { id: 'cs_test_123', client_reference_id: invoiceId,
  payment_intent: 'pi_123', amount_total: 12000, currency: 'sar',
  mode: 'payment', status: 'complete', payment_status: 'paid', metadata: { tenantId, invoiceId } };
const record = { stripeSessionId: session.id, tenantId, invoiceId };
const subscription = { id: subscriptionId, status: 'active', periodEndsAt: '2026-12-01' };
test('full refund is recognized and is never a paid event', () => {
 const result = parseStripePaymentException(event('charge.refunded', charge), false);
 assert.equal(result.type, 'full_refund'); assert.equal(result.amountMinor, 12000);
});
test('partial refund is tracked but does not auto-pause', () => {
 const result = parseStripePaymentException(event('charge.refunded', {...charge, amount_refunded: 4000}), false);
 assert.equal(result.type, 'partial_refund');
 assert.equal(shouldPauseOnPaymentException(result.type, subscription, invoice, subscriptionId, '2026-11-15'), false);
});
test('valid open dispute pauses only the matching current period', () => {
 const result = parseStripePaymentException(event('charge.dispute.created', dispute), false);
 assert.equal(result.type, 'dispute_opened');
 assert.equal(shouldPauseOnPaymentException(result.type, subscription, invoice, subscriptionId, '2026-11-15'), true);
});
test('won/lost dispute close is for manual review, not auto-reactivation', () => {
 for (const status of ['won','lost','warning_closed']) {
  const result = parseStripePaymentException(event('charge.dispute.closed', {...dispute,status}), false);
  assert.equal(result.type,'dispute_closed');
  assert.equal(shouldPauseOnPaymentException(result.type, subscription, invoice, subscriptionId, '2026-11-15'), false);
 }
});
test('refund from older period does not disable a renewed license', () => {
 assert.equal(shouldPauseOnPaymentException('full_refund',subscription,
  {...invoice,periodEndsAt:'2026-11-01'},subscriptionId,'2026-11-15'),false);
 assert.equal(shouldPauseOnPaymentException('full_refund',subscription,invoice,'different-id','2026-11-15'),false);
});
test('expired / already-paused subscription is not changed twice', () => {
 assert.equal(shouldPauseOnPaymentException('full_refund',subscription,invoice,subscriptionId,'2026-12-01'),false);
 assert.equal(shouldPauseOnPaymentException('dispute_opened',{...subscription,status:'paused'},invoice,subscriptionId,'2026-11-15'),false);
});
test('invalid refund amounts and bad payment intent IDs rejected', () => {
 for (const value of [0,12001,-5,'12000',1.5]) {
  assert.throws(()=>parseStripePaymentException(event('charge.refunded',{...charge,amount_refunded:value}),false));
 }
 assert.throws(()=>parseStripePaymentException(event('charge.refunded',{...charge,payment_intent:'pi_bad-!'}),false));
});
test('invalid dispute status rejected', () => {
 assert.throws(()=>parseStripePaymentException(event('charge.dispute.created',{...dispute,status:'won'}),false));
 assert.throws(()=>parseStripePaymentException(event('charge.dispute.closed',{...dispute,status:'under_review'}),false));
});
test('webhook mode mismatch rejected for reversal', () => {
 assert.throws(()=>parseStripePaymentException(event('charge.refunded', charge, true),false));
});
test('unrelated signed event is ignored by exception handler', () => {
 assert.equal(parseStripePaymentException(event('checkout.session.completed',{}),false),null);
});
test('validated server-side PaymentIntent resolves tenant and invoice', () => {
 const reversal = parseStripePaymentException(event('charge.refunded',charge),false);
 assert.deepEqual(assertStripeExceptionIntent(intent,reversal,false),{tenantId,invoiceId});
});
test('unknown, wrong-tenant and non-succeeded PaymentIntents rejected', () => {
 const reversal = parseStripePaymentException(event('charge.refunded',charge),false);
 for (const changed of [
  {...intent, id:'pi_wrong'}, {...intent, metadata:{...intent.metadata,tenantId:'other'}},
  {...intent,metadata:{}}, {...intent,status:'requires_payment_method'},
  {...intent,amount:1000}, {...intent,livemode:true}, {...intent,currency:'usd'},
 ]) assert.throws(()=>assertStripeExceptionIntent(changed,reversal,false));
});
test('Checkout creates PaymentIntent metadata for future refunds', () => {
 const params = stripeCheckoutParams(invoice,'https://example.com/success','https://example.com/cancel');
 assert.equal(params.get('payment_intent_data[metadata][tenantId]'),tenantId);
 assert.equal(params.get('payment_intent_data[metadata][invoiceId]'),invoiceId);
});
test('invoice match validates captured payment before quarantine', () => {
 assert.equal(assertStripePaymentInvoiceMatch(session,record,invoice),'pi_123');
 for (const changed of [
  {...session,amount_total:12001}, {...session,currency:'usd'},
  {...session,metadata:{...session.metadata,tenantId:subscriptionId}},
  {...session,payment_status:'unpaid'},
 ]) assert.throws(()=>assertStripePaymentInvoiceMatch(changed,record,invoice));
});

// Stripe can refund one charge in full without refunding the entire invoice.
// Revoking a paid licence for that partial invoice reversal is unsafe.
test('only a full invoice refund may pause an active entitlement', () => {
 assert.equal(refundCoversPaidInvoice(12000,12000),true);
 for (const amount of [1,4000,11999,12001,0,-1,1.5,Number.NaN])
  assert.equal(refundCoversPaidInvoice(amount,12000),false);
 assert.equal(refundCoversPaidInvoice(12000,0),false);
 const service = readFileSync(new URL('./stripe.service.ts',import.meta.url),'utf8');
 assert.match(service,/refundCoversPaidInvoice\(event\.amountMinor, matched\.amountMinor\)/);
 assert.match(service,/!!affected && refundCoversInvoice && shouldPauseOnPaymentException/);
});

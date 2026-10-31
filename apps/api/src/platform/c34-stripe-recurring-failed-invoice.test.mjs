import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { verifyStripeSignature } from './stripe-policy.ts';
import { parseFailedRecurringInvoice, failedInvoicePaymentIntentId, assertFailedRecurringProvider } from './stripe-recurring-failed-invoice.ts';

const tenantId = '11111111-1111-4111-8111-111111111111';
const localId = '22222222-2222-4222-8222-222222222222';
const planId = '33333333-3333-4333-8333-333333333333';
const start = 1793491200; // 2026-11-01 UTC
const end = 1796083200; // 2026-12-01 UTC
const plan = { id: planId, code: 'standard', priceMinor: 12000, currency: 'SAR',
  billingInterval: 'monthly', trialDays: 0, isActive: true };
const binding = { tenantId, subscriptionId: localId, planId,
  stripeSubscriptionId: 'sub_C34ABC', stripeCustomerId: 'cus_C34ABC',
  stripePriceId: 'price_C34ABC', status: 'active',
  lastPeriodEndsAt: new Date(start * 1000).toISOString(), cancelAtPeriodEnd: false };
const local = { id: localId, planId, status: 'active', cancelAtPeriodEnd: false,
  periodStartsAt: '2026-10-01T00:00:00.000Z',
  periodEndsAt: new Date(start * 1000).toISOString() };
const invoice = { object: 'invoice', id: 'in_C34ABC', livemode: false,
  status: 'open', paid: false, collection_method: 'charge_automatically',
  billing_reason: 'subscription_cycle', customer: 'cus_C34ABC',
  subscription: 'sub_C34ABC', currency: 'sar', amount_due: 12000,
  amount_paid: 0, amount_remaining: 12000, total: 12000, attempt_count: 1,
  payment_intent: 'pi_C34ABC',
  lines: { data: [{ price: { id: 'price_C34ABC' }, quantity: 1,
    amount: 12000, type: 'subscription', period: { start, end } }],
    has_more: false, total_count: 1 } };
const sub = { object: 'subscription', id: 'sub_C34ABC', livemode: false,
  status: 'past_due', cancel_at_period_end: false,
  customer: 'cus_C34ABC', latest_invoice: 'in_C34ABC',
  metadata: { tenantId, planId },
  items: { data: [{ price: { id: 'price_C34ABC' }, quantity: 1 }],
    has_more: false, total_count: 1 } };
const intent = { object: 'payment_intent', id: 'pi_C34ABC', livemode: false,
  status: 'requires_payment_method', amount: 12000, amount_received: 0,
  currency: 'sar', customer: 'cus_C34ABC', invoice: 'in_C34ABC' };
const signed = (i = invoice, eventId = 'evt_C34ABC') =>
  Buffer.from(JSON.stringify({ id: eventId, type: 'invoice.payment_failed',
    livemode: false, data: { object: i } }));
const candidate = parseFailedRecurringInvoice(signed(), false);
const check = (c = candidate, i = invoice, s = sub, pi = intent,
  b = binding, p = plan, l = local, latest = localId, now = Date.parse('2026-11-02T00:00:00Z')) =>
  assertFailedRecurringProvider(c, i, s, pi, b, p, l, latest, false, now);

test('signed failed invoice parses after Stripe HMAC verification; never represents paid funds', () => {
  const raw = signed();
  const secret = 'whsec_12345678901234567890123456789012';
  const ts = 1793491200;
  const signature = createHmac('sha256', secret)
    .update(String(ts)).update('.').update(raw).digest('hex');
  assert.equal(verifyStripeSignature(raw, 't=' + ts + ',v1=' + signature,
    secret, ts * 1000), true);
  assert.equal(candidate.invoiceId, invoice.id);
  assert.equal(candidate.billingReason, 'subscription_cycle');
  assert.throws(() => parseFailedRecurringInvoice(signed({ ...invoice, paid: true }), false));
  assert.throws(() => parseFailedRecurringInvoice(signed({ ...invoice, livemode: true }), false));
  assert.throws(() => parseFailedRecurringInvoice(signed({ ...invoice, amount_paid: 1 }), false));
  assert.throws(() => parseFailedRecurringInvoice(signed({ ...invoice, attempt_count: 0 }), false));
  assert.throws(() => parseFailedRecurringInvoice(signed({ ...invoice,
    parent: { subscription_details: { subscription: 'sub_OTHER' } } }), false));
  assert.throws(() => parseFailedRecurringInvoice(signed(), true));
});

test('failed invoice independently matches immutable tenant, plan, provider and unpaid intent', () => {
  assert.deepEqual(check(), { shouldPause: true, periodEndsAt: new Date(end * 1000).toISOString() });
  assert.deepEqual(check(candidate, invoice, sub, intent, binding, plan, local,
    localId, Date.parse('2026-10-31T00:00:00Z')).shouldPause, false);
  for (const bad of [
    { ...binding, tenantId: planId },
    { ...binding, stripeCustomerId: 'cus_OTHER' },
    { ...binding, cancelAtPeriodEnd: true },
    { ...binding, lastPeriodEndsAt: new Date((start + 60) * 1000).toISOString() },
  ]) assert.throws(() => check(candidate, invoice, sub, intent, bad));
  for (const bad of [
    { ...invoice, status: 'paid', paid: true },
    { ...invoice, amount_remaining: 0 },
    { ...invoice, lines: { ...invoice.lines, has_more: true } },
    { ...invoice, lines: { data: [...invoice.lines.data, ...invoice.lines.data] } },
    { ...invoice, lines: { data: [{ ...invoice.lines.data[0], price: 'price_OTHER' }] } },
    { ...invoice, payments: { data: [], has_more: true } },
  ]) assert.throws(() => check(candidate, bad));
  for (const bad of [
    { ...sub, metadata: { tenantId: planId, planId } },
    { ...sub, status: 'active' },
    { ...sub, items: { ...sub.items, has_more: true } },
    { ...sub, items: { data: [{ price: 'price_OTHER', quantity: 1 }] } },
  ]) assert.throws(() => check(candidate, invoice, bad));
  for (const bad of [
    { ...intent, status: 'succeeded', amount_received: 12000 },
    { ...intent, customer: 'cus_OTHER' },
    { ...intent, livemode: true },
  ]) assert.throws(() => check(candidate, invoice, sub, bad));
  assert.throws(() => check(candidate, invoice, sub, intent, binding, plan, local, planId));
  assert.throws(() => check(candidate, invoice, sub, intent, binding, plan,
    { ...local, cancelAtPeriodEnd: true }));
  assert.throws(() => assertFailedRecurringProvider(candidate, invoice, sub, intent,
    binding, plan, local, localId, true));
});

test('initial unpaid subscription stays ungranted; no PaymentIntent allowed only when absent', () => {
  const initial = { ...invoice, billing_reason: 'subscription_create', payment_intent: null };
  const c = parseFailedRecurringInvoice(signed(initial), false);
  const b = { ...binding, status: 'pending', lastPeriodEndsAt: null };
  const l = { ...local, status: 'trialing' };
  const s = { ...sub, status: 'incomplete' };
  assert.equal(failedInvoicePaymentIntentId(initial), null);
  assert.equal(check(c, initial, s, null, b, plan, l).shouldPause, true);
  assert.throws(() => check(c, initial, s, intent, b, plan, l));
  assert.throws(() => check(c, initial, s, null, binding, plan, l));
});

test('webhook wiring is signature-first, TEST-only, tenant locked and idempotent without grants', () => {
  const src = readFileSync(new URL('./stripe.service.ts', import.meta.url), 'utf8');
  const webhook = src.slice(src.indexOf('async webhook('));
  const method = src.slice(src.indexOf('private async recordRecurringFailedInvoice('),
    src.indexOf('private async settleRecurringInvoice('));
  assert.ok(webhook.indexOf('verifyStripeSignature(rawBody, header') <
    webhook.indexOf('parseFailedRecurringInvoice(rawBody, config.liveMode)'));
  assert.match(webhook, /return this\.recordRecurringFailedInvoice\(failedCandidate, sha256\(rawBody\), config\)/);
  assert.match(method, /config\.liveMode \|\| process\.env\.DEPLOYMENT_ENV === 'production'/);
  assert.match(method, /withTenant\(tenantId, async tx =>/);
  assert.match(method, /pg_advisory_xact_lock/);
  assert.match(method, /FOR UPDATE OF b, s/);
  assert.match(method, /assertFailedRecurringProvider/);
  assert.match(method, /payloadSha256/);
  assert.match(method, /billing\.stripe_recurring_invoice_failed/);
  assert.match(method, /status = 'past_due'/);
  assert.doesNotMatch(method, /INSERT INTO billing_payments|INSERT INTO billing_invoices|status = 'active'/);
});

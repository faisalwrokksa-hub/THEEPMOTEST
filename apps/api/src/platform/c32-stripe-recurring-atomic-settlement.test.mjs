import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assertRecurringLocalSettlement } from './stripe-recurring-local-settlement.ts';

const tenantId = '2bb4c19e-ac7d-47a3-8fa1-f917640e127a';
const subscriptionId = 'b2c9d9ab-cf27-4c33-9a60-0b9182bca0d2';
const planId = '72c72f05-c371-43c0-9f2a-9eb4b9945805';
const binding = { tenantId, subscriptionId, planId,
  stripeSubscriptionId: 'sub_TEST123', stripeCustomerId: 'cus_TEST123',
  stripePriceId: 'price_TEST123', status: 'pending',
  lastPeriodEndsAt: null, cancelAtPeriodEnd: false };
const local = { id: subscriptionId, planId, status: 'trialing',
  cancelAtPeriodEnd: false, periodStartsAt: '2026-10-01T00:00:00.000Z',
  periodEndsAt: '2026-10-31T00:00:00.000Z' };
const verified = { tenantId, subscriptionId, planId,
  stripeInvoiceId: 'in_TEST123', stripeSubscriptionId: 'sub_TEST123',
  paymentIntentId: 'pi_TEST123', eventId: 'evt_TEST123', amountMinor: 12000,
  currency: 'SAR', periodStartsAt: '2026-11-01T00:00:00.000Z',
  periodEndsAt: '2026-12-01T00:00:00.000Z' };
const now = Date.parse('2026-11-02T00:00:00.000Z');
const check = (b = binding, l = local, v = verified, latest = subscriptionId, time = now) =>
  assertRecurringLocalSettlement(b, l, v, latest, time);

test('initial signed and independently verified TEST invoice may advance an expired trial', () => {
  assert.doesNotThrow(() => check());
});
test('renewal requires matching active ledger and contiguous local period', () => {
  const active = { ...binding, status: 'active', lastPeriodEndsAt: verified.periodEndsAt };
  const subscribed = { ...local, status: 'active', periodStartsAt: verified.periodStartsAt,
    periodEndsAt: verified.periodEndsAt };
  const renewal = { ...verified, periodStartsAt: verified.periodEndsAt,
    periodEndsAt: '2027-01-01T00:00:00.000Z' };
  assert.doesNotThrow(() => check(active, subscribed, renewal));
  for (const bad of [
    { ...active, lastPeriodEndsAt: verified.periodStartsAt },
    { ...active, cancelAtPeriodEnd: true },
    { ...active, status: 'pending' },
  ]) assert.throws(() => check(bad, subscribed, renewal));
  for (const bad of [
    { ...subscribed, status: 'past_due' },
    { ...subscribed, status: 'paused' },
    { ...subscribed, cancelAtPeriodEnd: true },
    { ...subscribed, periodEndsAt: '2026-12-02T00:00:00.000Z' },
  ]) assert.throws(() => check(active, bad, renewal));
});
test('cross-tenant, superseded, wrong plan, expired and backdated grants fail closed', () => {
  for (const v of [
    { ...verified, tenantId: planId },
    { ...verified, subscriptionId: planId },
    { ...verified, planId: tenantId },
    { ...verified, stripeSubscriptionId: 'sub_DIFFERENT' },
    { ...verified, periodEndsAt: '2026-10-01T00:00:00.000Z' },
    { ...verified, periodStartsAt: '2026-09-01T00:00:00.000Z' },
  ]) assert.throws(() => check(binding, local, v));
  assert.throws(() => check(binding, local, verified, tenantId));
  assert.throws(() => check(binding, { ...local, id: tenantId }));
  assert.throws(() => check(binding, { ...local, planId: tenantId }));
  assert.throws(() => check(binding, local, verified, subscriptionId,
    Date.parse('2026-12-02T00:00:00.000Z')));
});

test('C32 signed webhook wiring is TEST-only, tenant-locked and atomic', () => {
  const source = readFileSync(new URL('./stripe.service.ts', import.meta.url), 'utf8');
  const method = source.slice(source.indexOf('private async settleRecurringInvoice('),
    source.indexOf('/** Stripe signs the raw request.'));
  const webhook = source.slice(source.indexOf('async webhook('));
  assert.match(webhook, /verifyStripeSignature\(rawBody, header/);
  assert.ok(webhook.indexOf('verifyStripeSignature(rawBody, header') <
    webhook.indexOf('parsePaidRecurringInvoice(rawBody, config.liveMode)'));
  assert.match(webhook, /return this\.settleRecurringInvoice\(candidate, sha256\(rawBody\), config\)/);
  assert.match(method, /config\.liveMode \|\| process\.env\.DEPLOYMENT_ENV === 'production'/);
  assert.match(method, /stripeApiFetch/);
  assert.match(method, /invoices\/\$\{candidate\.invoiceId\}/);
  assert.match(method, /subscriptions\/\$\{candidate\.subscriptionId\}/);
  assert.match(method, /payment_intents\/\$\{paymentIntentId\}/);
  assert.match(method, /prices\/\$\{binding\.stripePriceId\}/);
  assert.match(method, /assertRecurringStripePrice\(remotePrice, plan, binding\.stripePriceId, false\)/);
  assert.match(method, /Recurring invoice paid-state update failed/);
  assert.match(method, /withTenant\(tenantId, async tx =>/);
  assert.match(method, /pg_advisory_xact_lock/);
  assert.match(method, /FOR UPDATE OF b, s/);
  assert.match(method, /assertRecurringProviderSettlement/);
  assert.match(method, /assertRecurringLocalSettlement/);
  assert.match(method, /INSERT INTO billing_invoices/);
  assert.match(method, /INSERT INTO billing_webhook_receipts/);
  assert.match(method, /INSERT INTO billing_payments/);
  assert.match(method, /UPDATE tenant_subscriptions/);
  assert.match(method, /UPDATE billing_stripe_recurring_bindings/);
  assert.match(method, /billing\.stripe_recurring_invoice_settled/);
  assert.match(method, /Recurring Stripe event ID was reused with different content/);
  assert.match(method, /Recurring invoice period is already recorded/);
  assert.doesNotMatch(source.slice(0, source.indexOf('async prepareRecurringCheckout(')),
    /@Get\(|@Post\(/);
});

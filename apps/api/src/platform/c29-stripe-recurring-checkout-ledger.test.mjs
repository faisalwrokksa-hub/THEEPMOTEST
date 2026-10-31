import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assertRecurringStripePrice, stripeRecurringCheckoutParams } from './stripe-recurring-policy.ts';

const service = readFileSync(new URL('./stripe.service.ts', import.meta.url), 'utf8');
const controller = readFileSync(new URL('./billing.controller.ts', import.meta.url), 'utf8');
const start = service.indexOf('async prepareRecurringCheckout()');
const end = service.indexOf('/** Authenticated customer administrator creates hosted checkout', start);
const method = service.slice(start, end);

test('C29 TEST-only recurring Checkout is implemented but not customer-exposed', () => {
  assert.ok(start >= 0 && end > start);
  assert.match(method, /requireCapability\('pmoa_admin'\)/);
  assert.match(method, /config\.liveMode \|\| process\.env\.DEPLOYMENT_ENV === 'production'/);
  assert.match(method, /STRIPE_RECURRING_CHECKOUT_ENABLED !== 'true'/);
  assert.doesNotMatch(controller, /prepareRecurringCheckout|stripe\/recurring-checkout/);
});

test('C29 takes the same tenant lock as cancellation and signed invoice settlement', () => {
  assert.match(method, /withTenant\(tenantId, async tx =>/);
  assert.match(method, /pg_advisory_xact_lock\(1212, hashtext\(\$\{tenantId\}\)\)/);
  assert.match(method, /FOR UPDATE OF s/);
  assert.match(method, /current\.status !== 'trialing'/);
  assert.match(method, /billing_stripe_recurring_checkout_sessions/);
  assert.match(method, /billing_stripe_recurring_bindings/);
  assert.match(method, /billing_invoices/);
  assert.match(method, /reconcile before retry/);
});

test('C29 validates server-only Stripe Price before creating any hosted subscription session', () => {
  assert.match(method, /STRIPE_RECURRING_PRICE_IDS/);
  assert.match(method, /Object\.hasOwn\(priceMap, plan\.code\)/);
  assert.match(method, /\/v1\/prices\/\$\{configuredPrice\}/);
  assert.match(method, /assertRecurringStripePrice\(price, plan, configuredPrice, false\)/);
  assert.match(method, /stripeRecurringCheckoutParams\(plan, tenantId, verifiedPrice/);
  assert.match(method, /stripeRecurringIdempotencyKey\(tenantId, plan\.id, 0\)/);
  assert.match(method, /assertCreatedRecurringCheckout\(session, plan, tenantId, false\)/);
});

test('C29 persists a pending Checkout reference without activating any entitlement', () => {
  assert.match(method, /INSERT INTO billing_stripe_recurring_checkout_sessions/);
  assert.match(method, /ON CONFLICT \(stripe_session_id\) DO NOTHING RETURNING id/);
  assert.match(method, /billing\.stripe_recurring_checkout_created/);
  assert.match(method, /paymentVerified: false/);
  assert.doesNotMatch(method, /UPDATE tenant_subscriptions|INSERT INTO billing_payments|billing_webhook_receipts/);
});

test('recurring Checkout policy accepts only an independently verified server price', () => {
  const tenant = '2bb4c19e-ac7d-47a3-8fa1-f917640e127a';
  const plan = { id: '72c72f05-c371-43c0-9f2a-9eb4b9945805',
    code: 'pro', priceMinor: 12000, currency: 'SAR',
    billingInterval: 'monthly', trialDays: 0, isActive: true };
  const price = { id: 'price_TEST123', object: 'price', active: true, livemode: false,
    type: 'recurring', billing_scheme: 'per_unit', currency: 'sar',
    unit_amount: 12000, recurring: { interval: 'month', interval_count: 1, usage_type: 'licensed' } };
  const trusted = assertRecurringStripePrice(price, plan, price.id, false);
  const args = [plan, tenant, trusted, false,
    'https://theepmo.com/billing?billing=success',
    'https://theepmo.com/billing?billing=cancelled'];
  assert.equal(stripeRecurringCheckoutParams(...args).get('mode'), 'subscription');
  assert.throws(() => stripeRecurringCheckoutParams(plan, tenant,
    { priceId: price.id, planId: plan.id, liveMode: false }, false, args[4], args[5]));
  assert.throws(() => assertRecurringStripePrice({ ...price, livemode: true }, plan, price.id, false));
});

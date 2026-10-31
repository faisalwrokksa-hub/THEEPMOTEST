import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const service = readFileSync(new URL('./stripe.service.ts', import.meta.url), 'utf8');
const start = service.indexOf('private async bindRecurringCheckout(');
const end = service.indexOf('/** Stripe signs the raw request.', start);
const binding = service.slice(start, end);
const webhook = service.slice(service.indexOf('async webhook('));

test('C30 webhook signature verification precedes any recurring event parsing', () => {
  assert.ok(start > 0 && end > start);
  assert.ok(webhook.indexOf('verifyStripeSignature(') <
    webhook.indexOf('parseSignedRecurringCheckout('));
  assert.match(webhook, /if \(recurringCheckout\) return this\.bindRecurringCheckout\(recurringCheckout, config\)/);
});

test('C30 binding is TEST-only, tenant-locked, ledger-owned and provider-verified', () => {
  assert.match(binding, /config\.liveMode \|\| process\.env\.DEPLOYMENT_ENV === 'production'/);
  assert.match(binding, /STRIPE_RECURRING_CHECKOUT_ENABLED !== 'true'/);
  assert.match(binding, /withTenant\(tenantId, async tx =>/);
  assert.match(binding, /pg_advisory_xact_lock\(1212, hashtext\(\$\{tenantId\}\)\)/);
  assert.match(binding, /billing_stripe_recurring_checkout_sessions/);
  assert.match(binding, /FOR UPDATE OF c, s/);
  assert.match(binding, /billing_stripe_recurring_bindings/);
  assert.match(binding, /assertRecurringCheckoutBinding\(candidate, remoteSession,/);
  assert.match(binding, /api\.stripe\.com\/v1\/checkout\/sessions/);
  assert.match(binding, /api\.stripe\.com\/v1\/subscriptions/);
  assert.match(binding, /readStripeApiJson\(response\)/);
  assert.match(binding, /ON CONFLICT DO NOTHING RETURNING id/);
});

test('C30 does not activate access or expose unfinished recurring Checkout', () => {
  const controller = readFileSync(new URL('./billing.controller.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(binding, /UPDATE tenant_subscriptions|INSERT INTO billing_payments|status = 'active'/);
  assert.match(binding, /'pending'/);
  assert.match(binding, /paymentVerified: false/);
  assert.doesNotMatch(controller, /prepareRecurringCheckout|bindRecurringCheckout|recurring-checkout/);
});

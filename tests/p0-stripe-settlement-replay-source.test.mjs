import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const service = readFileSync(new URL('../apps/api/src/platform/stripe.service.ts', import.meta.url), 'utf8');

test('a second signed event for an already paid invoice cannot grant a second period', () => {
  const paid = service.slice(service.indexOf("if (invoice.status === 'paid')"), service.indexOf('const latest =', service.indexOf("if (invoice.status === 'paid')")));
  assert.ok(paid.length > 100, 'paid invoice handling must exist');
  assert.match(paid, /existing\.paymentIntent === session\.payment_intent/);
  assert.match(paid, /duplicate: true/);
  assert.match(paid, /invoice_already_paid_by_other_payment/);
  assert.doesNotMatch(paid, /UPDATE tenant_subscriptions/);
});

test('event identity reuse is rejected before financial mutation', () => {
  const receipt = service.slice(service.indexOf('INSERT INTO billing_webhook_receipts', service.indexOf('async webhook(')));
  assert.match(receipt, /ON CONFLICT \(provider, provider_event_id\) DO NOTHING/);
  assert.match(receipt, /existing\.payloadSha256 !== digest/);
  assert.match(receipt, /Stripe event identity was reused with different content/);
});

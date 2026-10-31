import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripeCheckoutUrlAllowed } from './stripe-policy.ts';

const service = readFileSync(new URL('./stripe.service.ts', import.meta.url), 'utf8');

test('cached Checkout session is revalidated before returning a payment navigation URL', () => {
  const begin = service.indexOf('if (existing) {');
  const end = service.indexOf('// Stripe caches requests by idempotency key.', begin);
  assert.ok(begin >= 0 && end > begin, 'cached Checkout branch must exist');
  const cached = service.slice(begin, end);
  assert.match(cached, /stripeCheckoutUrlAllowed\(existing\.url\)/);
  assert.match(cached, /existing\.sessionId\.startsWith\('cs_live_'\) !== config\.liveMode/);
  assert.match(cached, /Stored Stripe Checkout reference failed validation/);
  assert.ok(cached.indexOf('stripeCheckoutUrlAllowed(existing.url)') < cached.indexOf('return { invoiceId'),
    'cached URL must be validated before returning it');
});

test('a null or malformed Stripe API JSON object cannot bypass response validation', () => {
  assert.match(service, /const url = session && typeof session\.url === 'string'/);
  assert.match(service, /if \(!session \|\| !stripeCheckoutUrlAllowed\(url\)/);
});

test('cached and fresh Stripe URLs share the strict host boundary', () => {
  assert.equal(stripeCheckoutUrlAllowed('https://checkout.stripe.com/c/pay/cs_test_VALID#secure'), true);
  for (const url of [
    'https://checkout.stripe.com.evil.example/c/pay/cs_test_VALID',
    'https://user@checkout.stripe.com/c/pay/cs_test_VALID',
    'https://checkout.stripe.com:8443/c/pay/cs_test_VALID',
    'http://checkout.stripe.com/c/pay/cs_test_VALID',
    'javascript:alert(1)',
    null,
  ]) assert.equal(stripeCheckoutUrlAllowed(url), false);
});

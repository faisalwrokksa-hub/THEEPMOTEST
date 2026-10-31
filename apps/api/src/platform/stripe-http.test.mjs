import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripeApiFetch } from './stripe-policy.ts';

const endpoint = 'https://api.stripe.com/v1/checkout/sessions';

test('Stripe API transport disables redirects for credentialed requests', async () => {
  let seen;
  const response = await stripeApiFetch(endpoint, {
    method: 'POST', headers: { Authorization: 'Bearer sk_test_example' }, body: 'mode=payment',
  }, async (url, init) => {
    seen = { url, init };
    return new Response('{}', { status: 200 });
  });
  assert.equal(response.status, 200);
  assert.equal(seen.url, endpoint);
  assert.equal(seen.init.redirect, 'error');
  assert.equal(seen.init.headers.Authorization, 'Bearer sk_test_example');
  assert.equal(seen.init.body, 'mode=payment');
});

test('Stripe API transport refuses redirects even from a mocked HTTP transport', async () => {
  await assert.rejects(
    stripeApiFetch(endpoint, {}, async () => Response.redirect('https://evil.example/steal', 302)),
    /redirects are forbidden/,
  );
  await assert.rejects(
    stripeApiFetch(endpoint, {}, async () => ({ status: 200, redirected: true })),
    /redirects are forbidden/,
  );
});

test('Stripe API transport rejects untrusted destinations before sending credentials', async () => {
  let called = 0;
  const transport = async () => { called++; return new Response('{}'); };
  for (const url of [
    'http://api.stripe.com/v1/checkout/sessions',
    'https://api.stripe.com.evil.example/v1/checkout/sessions',
    'https://api.stripe.com@evil.example/v1/checkout/sessions',
    'https://user:pass@api.stripe.com/v1/checkout/sessions',
    'https://api.stripe.com:8443/v1/checkout/sessions',
    'https://api.stripe.com/v1/checkout/sessions?redirect=1',
    'https://api.stripe.com/v1/checkout/sessions#fragment',
    'https://api.stripe.com/not-stripe-api',
    'javascript:alert(1)',
  ]) await assert.rejects(stripeApiFetch(url, {
    headers: { Authorization: 'Bearer sk_test_example' },
  }, transport), /Stripe API/);
  assert.equal(called, 0, 'credentials must not reach an untrusted transport destination');
});

test('Checkout creation and refund verification both use redirect-safe Stripe transport', () => {
  const source = readFileSync(new URL('./stripe.service.ts', import.meta.url), 'utf8');
  assert.match(source, /await stripeApiFetch\('https:\/\/api\.stripe\.com\/v1\/checkout\/sessions'/);
  assert.match(source, /await stripeApiFetch\(`https:\/\/api\.stripe\.com\/v1\/payment_intents\/\$\{event\.paymentIntent\}`/);
  assert.doesNotMatch(source, /await fetch\(/);
});

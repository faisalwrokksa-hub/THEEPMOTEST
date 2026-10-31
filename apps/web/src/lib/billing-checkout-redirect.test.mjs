import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripeCheckoutRedirect } from './billing-checkout-redirect.ts';

const invoiceId = 'ae6c076e-c4fe-4cb0-9eda-476ea8d59024';
const sessionId = 'cs_test_ABC123';
const valid = { invoiceId, sessionId,
  url: `https://checkout.stripe.com/c/pay/${sessionId}#fidkdWxOYHwnPyd1blpx` };

test('accepts only the exact server-issued invoice and Checkout session', () => {
  assert.equal(stripeCheckoutRedirect(valid, invoiceId)?.hostname, 'checkout.stripe.com');
  assert.equal(stripeCheckoutRedirect({ ...valid,
    url: `https://checkout.stripe.com/pay/${sessionId}?prefilled_email=test%40example.com` },
    invoiceId)?.pathname, `/pay/${sessionId}`);
  assert.equal(stripeCheckoutRedirect({ ...valid, sessionId: 'cs_live_ABC123' }, invoiceId), null);
  assert.equal(stripeCheckoutRedirect({ ...valid, invoiceId: 'ae6c076e-c4fe-4cb0-9eda-476ea8d59025' }, invoiceId), null);
  assert.equal(stripeCheckoutRedirect(valid, 'not-a-uuid'), null);
});

test('rejects valid Stripe hostname with unrelated or encoded session paths', () => {
  for (const url of [
    'https://checkout.stripe.com/c/pay/cs_test_OTHER',
    'https://checkout.stripe.com/pay/cs_test_OTHER',
    'https://checkout.stripe.com/c/pay/cs_test_ABC123/extra',
    'https://checkout.stripe.com/c/pay/%63s_test_ABC123',
    'https://checkout.stripe.com/',
  ]) assert.equal(stripeCheckoutRedirect({ ...valid, url }, invoiceId), null, url);
});

test('rejects lookalike hosts, credential URLs, alternate ports, non-HTTPS and malformed provider replies', () => {
  for (const url of [
    'https://checkout.stripe.com.evil.example/c/pay/cs_test_ABC123',
    'https://evil.example/c/pay/cs_test_ABC123',
    'https://attacker@checkout.stripe.com/c/pay/cs_test_ABC123',
    'https://checkout.stripe.com:8443/c/pay/cs_test_ABC123',
    'http://checkout.stripe.com/c/pay/cs_test_ABC123',
    'javascript:alert(1)', '/c/pay/cs_test_ABC123', 'not a url',
    'https://checkout.stripe.com/c/pay/cs_test_ABC123' + 'a'.repeat(8200),
  ]) assert.equal(stripeCheckoutRedirect({ ...valid, url }, invoiceId), null, url.slice(0, 120));
  for (const value of [null, undefined, 42, [], {}, { ...valid, url: null },
    { ...valid, sessionId: null }, { ...valid, sessionId: 'cs_test_BAD-ID' }])
    assert.equal(stripeCheckoutRedirect(value, invoiceId), null);
});

test('billing proxy forbids credentialed upstream redirects and never reflects backend diagnostics', () => {
  const source = readFileSync(new URL('../app/api/billing/checkout/route.ts', import.meta.url), 'utf8');
  assert.match(source, /rejectUnsafeBrowserMutation\(req\)/);
  assert.match(source, /redirect: 'error'/);
  assert.match(source, /response\.redirected/);
  assert.match(source, /stripeCheckoutRedirect\(data, invoiceId\)/);
  assert.doesNotMatch(source, /error\?\.message/);
  assert.doesNotMatch(source, /new URL\(data\?\.url\)/);
});

test('subscription cancellation proxy also forbids session-cookie redirects', () => {
  const source = readFileSync(new URL('../app/api/billing/subscription/route.ts', import.meta.url), 'utf8');
  assert.match(source, /rejectUnsafeBrowserMutation\\(req\\)/);
  assert.match(source, /redirect: 'error'/);
  assert.match(source, /response\\.redirected/);
  assert.match(source, /response\\.status >= 300/);
  assert.match(source, /subscription-action-failed/);
});

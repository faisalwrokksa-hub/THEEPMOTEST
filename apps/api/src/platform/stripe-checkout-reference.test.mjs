import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripeCheckoutReferenceValid, stripeCreatedSessionIsPending } from './stripe-policy.ts';

const id = 'cs_test_ABC123';
const hosted = `https://checkout.stripe.com/c/pay/${id}#stripe-checkout-fragment`;

test('hosted Checkout URL is bound to the exact session identity', () => {
  assert.equal(stripeCheckoutReferenceValid(hosted, id), true);
  assert.equal(stripeCheckoutReferenceValid(`https://checkout.stripe.com/pay/${id}?prefilled_email=a%40b.com`, id), true);
  assert.equal(stripeCheckoutReferenceValid(hosted, 'cs_test_OTHER'), false);
  assert.equal(stripeCheckoutReferenceValid(hosted, 'cs_live_ABC123'), false);
});

test('valid Stripe hostname cannot disguise a different or unrelated Checkout destination', () => {
  for (const url of [
    'https://checkout.stripe.com/c/pay/cs_test_OTHER',
    'https://checkout.stripe.com/c/pay/cs_test_ABC123/extra',
    'https://checkout.stripe.com/c/pay/cs_test_ABC123.evil',
    'https://checkout.stripe.com/c/pay/%63s_test_ABC123',
    'https://checkout.stripe.com/unrelated/cs_test_ABC123',
    'https://checkout.stripe.com/pay/cs_test_ABC123/next',
    'https://checkout.stripe.com.evil.example/c/pay/cs_test_ABC123',
    'http://checkout.stripe.com/c/pay/cs_test_ABC123',
  ]) assert.equal(stripeCheckoutReferenceValid(url, id), false, url);
  for (const bad of [undefined, null, 4, {}, 'cs_test_ABC123/extra'])
    assert.equal(stripeCheckoutReferenceValid(hosted, bad), false);
});

test('fresh Stripe payment-mode Checkout must be open, unpaid and without a captured intent', () => {
  const pending = { status: 'open', payment_status: 'unpaid', payment_intent: null };
  assert.equal(stripeCreatedSessionIsPending(pending), true);
  for (const invalid of [
    { ...pending, status: 'complete' },
    { ...pending, status: 'expired' },
    { ...pending, payment_status: 'paid' },
    { ...pending, payment_status: 'no_payment_required' },
    { ...pending, payment_intent: 'pi_ABC123' },
    { ...pending, payment_intent: undefined },
    null, undefined, {}, 'pending',
  ]) assert.equal(stripeCreatedSessionIsPending(invalid), false);
});

test('both cached and newly created Checkout responses enforce the new boundaries', () => {
  const service = readFileSync(new URL('./stripe.service.ts', import.meta.url), 'utf8');
  assert.match(service, /stripeCheckoutReferenceValid\(existing\.url, existing\.sessionId\)/);
  assert.match(service, /stripeCheckoutReferenceValid\(url, session\.id\)/);
  assert.match(service, /stripeCreatedSessionIsPending\(session\)/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readStripeApiJson } from './stripe-policy.ts';

test('valid Stripe JSON under the cap is parsed', async () => {
  assert.deepEqual(await readStripeApiJson(new Response(JSON.stringify({ id: 'cs_test_OK' }),
    { headers: { 'content-type': 'application/json' } })), { id: 'cs_test_OK' });
});
test('valid numeric Content-Length is accepted', async () => {
  assert.deepEqual(await readStripeApiJson(new Response('{}', {
    headers: { 'content-length': '2' },
  })), {});
});
test('declared oversized Stripe JSON is rejected before reading', async () => {
  const response = new Response('{}', { headers: { 'content-length': '262145' } });
  await assert.rejects(readStripeApiJson(response), /exceeds the response limit/);
  await assert.rejects(readStripeApiJson(new Response('{}', {
    headers: { 'content-length': 'not-a-number' },
  })), /exceeds the response limit/);
});
test('chunked oversized Stripe JSON without Content-Length is rejected', async () => {
  const response = new Response(new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(160_000).fill(32));
      controller.enqueue(new Uint8Array(160_000).fill(32));
      controller.close();
    },
  }));
  await assert.rejects(readStripeApiJson(response), /exceeds the response limit/);
});
test('invalid or empty Stripe JSON fails closed', async () => {
  await assert.rejects(readStripeApiJson(new Response('not json')), /Invalid Stripe API JSON/);
  await assert.rejects(readStripeApiJson(new Response('')), /response is empty/);
  await assert.rejects(readStripeApiJson(new Response(null, { status: 204 })), /no body/);
});
test('all credentialed Stripe API responses use the bounded JSON reader, including recurring Checkout', () => {
  const service = readFileSync(new URL('./stripe.service.ts', import.meta.url), 'utf8');
  // The recurring Price and Checkout requests add two bounded reads.
  // Future endpoints may add more; do not hard-code the total call count.
  assert.ok((service.match(/await readStripeApiJson\(/g) || []).length >= 5);
  assert.doesNotMatch(service, /await [A-Za-z_$][\w$]*\.json\(\)/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const policy=readFileSync(new URL('../apps/api/src/platform/stripe-policy.ts', import.meta.url),'utf8');
test('Stripe lifecycle policy retains signature, settlement and idempotency safeguards',()=>{
 for(const name of ['verifyStripeSignature','assertStripeSettlement','stripeCheckoutIdempotencyKey','shouldPauseOnPaymentException','assertStripePaymentInvoiceMatch']) assert.match(policy,new RegExp('export function '+name+'\\('));
 assert.match(policy,/timingSafeEqual/);
 assert.match(policy,/session\.payment_status !== 'paid'/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const policy=readFileSync(new URL('../apps/api/src/platform/stripe-policy.ts', import.meta.url),'utf8');
test('Stripe lifecycle policy retains signature, settlement and idempotency safeguards',()=>{
 for(const name of ['verifyStripeSignature','assertStripeSettlement','stripeCheckoutIdempotencyKey','shouldPauseOnPaymentException','assertStripePaymentInvoiceMatch']) assert.match(policy,new RegExp('export function '+name+'\\('));
 assert.match(policy,/timingSafeEqual/);
 assert.match(policy,/session\.payment_status !== 'paid'/);
});

// The cancellation endpoint must serialize with Checkout and signed webhook
// settlement before acquiring a subscription row lock.
test('subscription cancellation shares Stripe settlement lock order', () => {
 const service = readFileSync(new URL('../apps/api/src/platform/subscription.service.ts', import.meta.url), 'utf8');
 const cancel = service.slice(service.indexOf('async setCancellation('), service.indexOf('async history()'));
 assert.match(cancel, /pg_advisory_xact_lock\(1212, hashtext\(\$\{tenantId\}\)\)/);
 assert.ok(cancel.indexOf('pg_advisory_xact_lock') < cancel.indexOf('FOR UPDATE'),
  'tenant advisory lock must be acquired before subscription row lock');
});

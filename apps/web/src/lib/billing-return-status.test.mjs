import test from 'node:test';
import assert from 'node:assert/strict';
import { checkoutReturnStatus } from './billing-return-status.mjs';
test('Stripe success is informational, never a paid grant',()=>{
 assert.equal(checkoutReturnStatus('success'),'awaiting-webhook');
});
test('provider cancelled redirect matches billing page',()=>{
 assert.equal(checkoutReturnStatus('cancelled'),'cancelled');
 assert.equal(checkoutReturnStatus('cancel'),'cancelled');
 for (const state of [undefined,'paid','true','completed']) assert.equal(checkoutReturnStatus(state),null);
});

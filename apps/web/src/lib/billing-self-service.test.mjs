import test from 'node:test';
import assert from 'node:assert/strict';
import {billingChangeGuidance} from './billing-self-service.mjs';
test('billing guidance rejects unapproved or unknown actions',()=>{
 assert.equal(billingChangeGuidance('upgrade',true),null);
 assert.equal(billingChangeGuidance('issue-invoice',false),null);
});
test('billing guidance preserves verified payment warning in two languages',()=>{
 assert.match(billingChangeGuidance('issue-invoice',true,'en'),/verified payment/);
 assert.match(billingChangeGuidance('issue-invoice',true,'ar'),/الدفع/);
});

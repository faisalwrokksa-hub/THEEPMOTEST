import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const get = name => readFileSync(new URL('../'+name,import.meta.url),'utf8');
const stripe = get('apps/api/src/platform/stripe.service.ts');
const migration = get('packages/db/migrations/0018_payment_exceptions.sql');
const rls = get('packages/db/sql/rls.sql');
const guard = get('apps/api/src/platform/billing.service.ts');
const controller = get('apps/api/src/platform/billing.controller.ts');
const tests = [
 ['signature checked before event dispatch',()=>{
   assert.ok(stripe.indexOf('verifyStripeSignature(') < stripe.indexOf('parseStripePaymentException('));
 }],
 ['refund handler loads PaymentIntent from Stripe before tenant transaction',()=>{
   const body=stripe.slice(stripe.indexOf('private async handlePaymentException('),stripe.indexOf('private async recordUnfulfilledSettlement('));
   assert.ok(body.indexOf('api.stripe.com/v1/payment_intents/') < body.indexOf('return withTenant('));
   assert.match(body,/assertStripeExceptionIntent\(/);
 }],
 ['payment matches invoice and intent before exception receipt',()=>{
   const body=stripe.slice(stripe.indexOf('private async handlePaymentException('),stripe.indexOf('private async recordUnfulfilledSettlement('));
   assert.ok(body.indexOf('matched.currency !== event.currency') < body.indexOf('INSERT INTO billing_webhook_receipts'));
 }],
 ['payment exception events require replay protection',()=>assert.match(stripe,/ON CONFLICT \(provider, provider_event_id\) DO NOTHING/)],
 ['full refunds and disputes can pause latest subscription',()=>assert.match(stripe,/shouldPauseOnPaymentException\(/)],
 ['captured payments ineligible for renewal are quarantined',()=>assert.match(stripe,/recordUnfulfilledSettlement\(/)],
 ['dispute closure does not auto-reactivate subscription',()=>{
   assert.doesNotMatch(stripe.slice(stripe.indexOf('private async handlePaymentException('),stripe.indexOf('private async recordUnfulfilledSettlement(')),/SET status = 'active'/);
 }],
 ['new ledger has RLS and tenant composite key',()=>{
   assert.match(migration,/FOREIGN KEY \(tenant_id, invoice_id\)/);
   assert.match(migration,/FORCE ROW LEVEL SECURITY/);
 }],
 ['exception ledger is append only to application role',()=>assert.match(rls,/REVOKE UPDATE, DELETE ON billing_payments, billing_webhook_receipts, billing_payment_exceptions/)],
 ['customer-only administrator may view exceptions',()=>{
   assert.match(guard,/async exceptions\(\).*requireCapability\('pmoa_admin'\)/s);
   assert.match(guard,/billing_payment_exceptions WHERE tenant_id = \$\{tenantId\}/);
   assert.match(controller,/@Get\('exceptions'\)/);
 }],
];
let errors=0;for(const [label,fn] of tests){try{fn();console.log('PASS',label);}catch(e){errors++;console.error('FAIL',label,e.message)}}
console.log(`${tests.length-errors}/${tests.length} payment exception checks passed`);
if(errors)process.exitCode=1;

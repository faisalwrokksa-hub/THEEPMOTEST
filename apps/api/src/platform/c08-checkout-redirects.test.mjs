import test from 'node:test';
import assert from 'node:assert/strict';
import { stripeCheckoutParams } from './stripe-policy.ts';
const invoice={id:'11111111-1111-4111-8111-111111111111',tenantId:'22222222-2222-4222-8222-222222222222',amountMinor:19900,currency:'SAR'};
const params=(s,c)=>stripeCheckoutParams(invoice,s,c);
test('Stripe Checkout retains metadata and trusted same-origin HTTPS redirects',()=>{
  const p=params('https://theepmo.com/billing/success','https://theepmo.com/billing/cancel');
  assert.equal(p.get('metadata[invoiceId]'),invoice.id);
  assert.equal(p.get('line_items[0][price_data][unit_amount]'),'19900');
});
test('local HTTP development callbacks remain possible but external HTTP is rejected',()=>{
  assert.doesNotThrow(()=>params('http://localhost:3000/success','http://localhost:3000/cancel'));
  assert.throws(()=>params('http://example.com/success','http://example.com/cancel'));
  assert.throws(()=>params('http://192.168.1.1/success','http://192.168.1.1/cancel'));
});
test('rejects cross-origin, credential, fragment, and unsupported-scheme redirects',()=>{
  for(const [s,c] of [
    ['https://theepmo.com/ok','https://evil.example/cancel'],
    ['https://name:password@theepmo.com/ok','https://theepmo.com/cancel'],
    ['https://theepmo.com/ok#token','https://theepmo.com/cancel'],
    ['javascript:alert(1)','https://theepmo.com/cancel'],
    ['https://theepmo.com/ok','http://localhost:3000/cancel'],
  ]) assert.throws(()=>params(s,c));
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { verifyStripeSignature, parsePaidStripeEvent, assertStripeSettlement, stripeCheckoutParams, stripeCheckoutIdempotencyKey, stripeCheckoutUrlAllowed, stripeDeploymentModeAllowed } from './stripe-policy.ts';
const tenantId = '2bb4c19e-ac7d-47a3-8fa1-f917640e127a';
const invoiceId = 'ae6c076e-c4fe-4cb0-9eda-476ea8d59024';
const subId = '72c72f05-c371-43c0-9f2a-9eb4b9945805';
const session = {id:'cs_test_AAA123',object:'checkout.session',livemode:false,mode:'payment',status:'complete',payment_status:'paid',payment_intent:'pi_123TEST',currency:'sar',amount_total:12000,client_reference_id:invoiceId,metadata:{tenantId,invoiceId}};
const invoice = {id:invoiceId,tenantId,subscriptionId:subId,status:'open',amountMinor:12000,currency:'SAR',periodStartsAt:'2026-11-01',periodEndsAt:'2026-12-01'};
const subscription={id:subId,tenantId,status:'active',periodEndsAt:'2026-11-01',cancelAtPeriodEnd:false};
const record={stripeSessionId:session.id,tenantId,invoiceId};
const secret='whsec_12345678901234567890123456789012';
const now=1761436800000;
const body=Buffer.from(JSON.stringify({id:'evt_ABC123',type:'checkout.session.completed',livemode:false,data:{object:session}}));
const ts=Math.floor(now/1000);
const sig=createHmac('sha256',secret).update(String(ts)).update('.').update(body).digest('hex');
test('valid Stripe raw body signature',()=>assert.equal(verifyStripeSignature(body,`t=${ts},v1=${sig}`,secret,now),true));
test('tampered body rejected',()=>assert.equal(verifyStripeSignature(Buffer.concat([body,Buffer.from(' ')]),`t=${ts},v1=${sig}`,secret,now),false));
test('old signature rejected',()=>assert.equal(verifyStripeSignature(body,`t=${ts},v1=${sig}`,secret,now+300001),false));
test('missing signature rejected',()=>assert.equal(verifyStripeSignature(body,'t='+ts,secret,now),false));
test('multiple signatures can include rotated key',()=>assert.equal(verifyStripeSignature(body,`t=${ts},v1=${'0'.repeat(64)},v1=${sig}`,secret,now),true));
test('valid checkout paid event accepted',()=>assert.equal(parsePaidStripeEvent(body,false)?.session.id,session.id));
test('livemode mismatch denied',()=>assert.throws(()=>parsePaidStripeEvent(body,true)));
test('signed event with mismatched Checkout session mode rejected',()=>{
 const changed = Buffer.from(JSON.stringify({id:'evt_MODE',type:'checkout.session.completed',livemode:false,
  data:{object:{...session,livemode:true}}}));
 assert.throws(()=>parsePaidStripeEvent(changed,false));
});
test('signed paid event without Checkout session mode rejected',()=>{
 const {livemode,...withoutMode}=session;
 const changed=Buffer.from(JSON.stringify({id:'evt_MISSING',type:'checkout.session.completed',livemode:false,
  data:{object:withoutMode}}));
 assert.throws(()=>parsePaidStripeEvent(changed,false));
});
test('unpaid checkout ignored',()=>assert.equal(parsePaidStripeEvent(Buffer.from(JSON.stringify({id:'evt_NEW',type:'checkout.session.completed',livemode:false,data:{object:{...session,payment_status:'unpaid'}}})),false),null));
test('ignored unrelated signed events',()=>assert.equal(parsePaidStripeEvent(Buffer.from(JSON.stringify({id:'evt_NEW',type:'charge.refunded',livemode:false,data:{object:{}}})),false),null));
test('valid settlement gives payment intent',()=>assert.equal(assertStripeSettlement(session,record,invoice,subscription),'pi_123TEST'));
test('wrong tenant metadata is rejected',()=>assert.throws(()=>assertStripeSettlement({...session,metadata:{...session.metadata,tenantId:subId}},record,invoice,subscription)));
test('wrong checkout session rejected',()=>assert.throws(()=>assertStripeSettlement({...session,id:'cs_test_OTHER'},record,invoice,subscription)));
test('wrong amount rejected',()=>assert.throws(()=>assertStripeSettlement({...session,amount_total:12001},record,invoice,subscription)));
test('wrong currency rejected',()=>assert.throws(()=>assertStripeSettlement({...session,currency:'usd'},record,invoice,subscription)));
test('missing payment intent rejected',()=>assert.throws(()=>assertStripeSettlement({...session,payment_intent:null},record,invoice,subscription)));
test('paid invoice rejected',()=>assert.throws(()=>assertStripeSettlement(session,record,{...invoice,status:'paid'},subscription)));
test('canceled subscription rejected',()=>assert.throws(()=>assertStripeSettlement(session,record,invoice,{...subscription,cancelAtPeriodEnd:true})));
test('changed period rejected',()=>assert.throws(()=>assertStripeSettlement(session,record,invoice,{...subscription,periodEndsAt:'2027-01-01'})));
test('checkout parameters are server-bound',()=>{
 const p=stripeCheckoutParams({id:invoiceId,tenantId,amountMinor:12000,currency:'SAR'},'https://theepmo.com/?billing=success','https://theepmo.com/?billing=cancel');
 assert.equal(p.get('line_items[0][price_data][unit_amount]'),'12000');
 assert.equal(p.get('mode'),'payment');
 assert.equal(p.get('metadata[tenantId]'),tenantId);
});

test('Stripe idempotency key is stable within an attempt',()=>{
 assert.equal(stripeCheckoutIdempotencyKey(invoiceId,0),stripeCheckoutIdempotencyKey(invoiceId,0));
});
test('new checkout attempt never reuses an expired session key',()=>{
 assert.notEqual(stripeCheckoutIdempotencyKey(invoiceId,0),stripeCheckoutIdempotencyKey(invoiceId,1));
 assert.notEqual(stripeCheckoutIdempotencyKey(invoiceId,1),stripeCheckoutIdempotencyKey(invoiceId,2));
});
test('invalid invoice and attempt index fail closed',()=>{
 assert.throws(()=>stripeCheckoutIdempotencyKey('not-an-invoice',0));
 for (const index of [-1,1.5,Number.NaN,1_000_001])
  assert.throws(()=>stripeCheckoutIdempotencyKey(invoiceId,index));
});

test('production requires live Stripe keys by default',()=>{
 assert.equal(stripeDeploymentModeAllowed(false,'production',undefined,undefined),false);
 assert.equal(stripeDeploymentModeAllowed(true,'production',undefined,undefined),true);
});
test('production-build staging requires two explicit test-mode flags',()=>{
 assert.equal(stripeDeploymentModeAllowed(false,'production','staging',undefined),false);
 assert.equal(stripeDeploymentModeAllowed(false,'production','production','true'),false);
 assert.equal(stripeDeploymentModeAllowed(false,'production','staging','true'),true);
});

// RC1 regression: staging must not accept live-money keys under any flag.
test('staging rejects live Stripe keys', () => {
 assert.equal(stripeDeploymentModeAllowed(true, 'production', 'staging', 'true'), false);
 assert.equal(stripeDeploymentModeAllowed(true, 'development', 'staging', 'true'), false);
});

// P0: DEPLOYMENT_ENV must take precedence over an incorrectly set NODE_ENV.
test('production target never accepts test payments with development NODE_ENV', () => {
 for (const nodeEnv of ['development', 'test', undefined]) {
  assert.equal(stripeDeploymentModeAllowed(false, nodeEnv, 'production', 'true'), false);
  assert.equal(stripeDeploymentModeAllowed(false, nodeEnv, 'production', undefined), false);
  assert.equal(stripeDeploymentModeAllowed(true, nodeEnv, 'production', undefined), false);
 }
});
test('production live payments demand production NODE_ENV and no test override', () => {
 assert.equal(stripeDeploymentModeAllowed(true, 'production', 'production', undefined), true);
 assert.equal(stripeDeploymentModeAllowed(true, 'production', 'production', 'true'), false);
});
test('staging accepts only explicitly authorized Stripe test mode', () => {
 assert.equal(stripeDeploymentModeAllowed(false, 'production', 'staging', 'true'), true);
 assert.equal(stripeDeploymentModeAllowed(false, 'development', 'staging', 'true'), false);
 assert.equal(stripeDeploymentModeAllowed(true, 'production', 'staging', 'true'), false);
});
test('unrecognized deployments and local live keys fail closed', () => {
 for (const target of ['prod', 'stagin', 'sandbox', 'qa'])
  assert.equal(stripeDeploymentModeAllowed(false, 'development', target, undefined), false);
 assert.equal(stripeDeploymentModeAllowed(true, 'development', undefined, undefined), false);
 assert.equal(stripeDeploymentModeAllowed(false, 'development', undefined, undefined), true);
});

test('hosted Stripe Checkout URLs allow legitimate Stripe payment paths and fragments', () => {
 for (const url of [
  'https://checkout.stripe.com/c/pay/cs_test_ABC123#fidkdWxOYHwnPyd1blpxYHZxWjA0',
  'https://checkout.stripe.com/pay/cs_test_ABC123?prefilled_email=test%40example.com',
 ]) assert.equal(stripeCheckoutUrlAllowed(url), true, url);
});
test('hosted Checkout URL rejects lookalikes, credentials, alternate ports and homepage', () => {
 for (const url of [
  'http://checkout.stripe.com/c/pay/123',
  'https://checkout.stripe.com.evil.example/c/pay/123',
  'https://evil.example/c/pay/123',
  'https://user:password@checkout.stripe.com/c/pay/123',
  'https://checkout.stripe.com:8443/c/pay/123',
  'https://checkout.stripe.com/',
  'javascript:alert(1)',
  'not a URL',
  null, 17, 'https://checkout.stripe.com/' + 'x'.repeat(8192),
 ]) assert.equal(stripeCheckoutUrlAllowed(url), false, String(url).slice(0,120));
});

test('Checkout session ID prefix must agree with signed event and object livemode', () => {
 const makeEvent = (id, objectLive, eventLive) => Buffer.from(JSON.stringify({
  id: 'evt_MODEPREFIX', type: 'checkout.session.completed', livemode: eventLive,
  data: { object: { ...session, id, livemode: objectLive } },
 }));
 assert.throws(() => parsePaidStripeEvent(makeEvent('cs_live_ABC123', false, false), false));
 assert.throws(() => parsePaidStripeEvent(makeEvent('cs_test_ABC123', true, true), true));
 assert.equal(parsePaidStripeEvent(makeEvent('cs_test_ABC123', false, false), false)?.session.id, 'cs_test_ABC123');
 assert.equal(parsePaidStripeEvent(makeEvent('cs_live_ABC123', true, true), true)?.session.id, 'cs_live_ABC123');
});

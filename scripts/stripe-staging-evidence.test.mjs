import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateEvidenceConfig, collectStripeEvidence, assertStripeBaseline, assertStripeVerified, assertStripeReplayStable } from './stripe-staging-evidence.mjs';

const invoiceId = '6a09b372-a4a5-4cef-8a2e-c16b8cae00ab';
const tenantId = 'c47bf504-3bb0-4f81-9143-a155c0e1a117';
const subscriptionId = 'c250de9d-a7bf-42fb-9d9e-113f303e1ef6';
const sessionId = 'cs_test_Example123';
const env = {
 DEPLOYMENT_ENV: 'staging', STRIPE_SECRET_KEY: 'sk_test_abcdefghijklmno1234',
 STRIPE_E2E_API_ORIGIN: 'https://api-staging.theepmo.example',
 STRIPE_E2E_SESSION_ID: sessionId, STRIPE_E2E_INVOICE_ID: invoiceId,
 STRIPE_E2E_TENANT_A_COOKIE: 'tenant_a_mock_cookie_12345',
 STRIPE_E2E_TENANT_B_COOKIE: 'tenant_b_mock_cookie_12345',
};
const invoice = {
 id: invoiceId, tenantId, subscriptionId, periodStartsAt:'2026-11-01T00:00:00Z',
 periodEndsAt:'2026-12-01T00:00:00Z',amountMinor:15000,currency:'SAR',status:'open',
};
const subscription = { id: subscriptionId, status: 'active', periodStartsAt:'2026-10-01T00:00:00Z', periodEndsAt:'2026-11-01T00:00:00Z'};
const stripe = {
 object:'checkout.session',id:sessionId,livemode:false,mode:'payment',
 payment_status:'unpaid', status:'open', amount_total:15000,currency:'sar',
 payment_intent:null,client_reference_id:invoiceId,metadata:{invoiceId,tenantId},
};
const fixture = (paid = false) => {
 const i={...invoice, status:paid?'paid':'open'};
 const s={...subscription, status:'active', periodStartsAt:paid?'2026-11-01T00:00:00Z':subscription.periodStartsAt,
  periodEndsAt:paid?'2026-12-01T00:00:00Z':subscription.periodEndsAt};
 const payments=paid?[{invoiceId, provider:'stripe', providerPaymentId:'pi_ABC123', amountMinor:15000, currency:'SAR'}]:[];
 const checkout={...stripe,payment_status:paid?'paid':'unpaid',status:paid?'complete':'open',payment_intent:paid?'pi_ABC123':null};
 return (url, options) => {
  const path = new URL(url).pathname;
  if (url.startsWith('https://api.stripe.com')) {
   assert.equal(options.headers.authorization, `Bearer ${env.STRIPE_SECRET_KEY}`);
   return Promise.resolve({status:200,json:async()=>checkout});
  }
  const tenantA = options.headers.cookie === `pmo_session=${env.STRIPE_E2E_TENANT_A_COOKIE}`;
  const tenantB = options.headers.cookie === `pmo_session=${env.STRIPE_E2E_TENANT_B_COOKIE}`;
  assert.ok(tenantA || tenantB, 'unexpected cookie');
  const data = path.endsWith('/invoices') ? (tenantA?[i]:[]) :
   path.endsWith('/payments') ? (tenantA?payments:[]) :
   path.endsWith('/current') ? (tenantA?s:null) : null;
  assert.notEqual(data,null,'unexpected request');
  return Promise.resolve({status:200,json:async()=>data});
 };
};

test('rejects live Stripe keys and production mode',()=>{
 assert.throws(()=>validateEvidenceConfig({...env, STRIPE_SECRET_KEY:'sk_live_12345678901234567890'}),/TEST/);
 assert.throws(()=>validateEvidenceConfig({...env, DEPLOYMENT_ENV:'production'}),/staging/);
});
test('rejects insecure or credentialed origins and shared tenant sessions',()=>{
 assert.throws(()=>validateEvidenceConfig({...env,STRIPE_E2E_API_ORIGIN:'http://api-staging.theepmo.example'}),/HTTPS/);
 assert.throws(()=>validateEvidenceConfig({...env,STRIPE_E2E_API_ORIGIN:'https://user:pass@api-staging.theepmo.example'}),/HTTPS/);
 assert.throws(()=>validateEvidenceConfig({...env,STRIPE_E2E_TENANT_B_COOKIE:env.STRIPE_E2E_TENANT_A_COOKIE}),/Distinct/);
});
test('reads an unpaid baseline and a paid Stripe settlement without any mutation',async()=>{
 const baseline=await collectStripeEvidence(env,fixture(false));
 assert.equal(assertStripeBaseline(baseline),true);
 const settled=await collectStripeEvidence(env,fixture(true));
 assert.equal(assertStripeVerified(baseline,settled),true);
 assert.equal(settled.paymentCount,1);
 assert.equal(JSON.stringify(settled).includes(env.STRIPE_SECRET_KEY),false);
 assert.equal(JSON.stringify(settled).includes(env.STRIPE_E2E_TENANT_A_COOKIE),false);
});
test('fails baseline when payment is already complete',async()=>{
 const settled=await collectStripeEvidence(env,fixture(true));
 assert.throws(()=>assertStripeBaseline(settled),/unpaid/);
});
test('fails if an amount or currency disagrees with Stripe',async()=>{
 const stripeWrong = async (url,opts)=> {
  const result = await fixture(false)(url,opts);
  if(url.startsWith('https://api.stripe.com')) return {status:200,json:async()=>({...stripe,amount_total:15001})};
  return result;
 };
 await assert.rejects(()=>collectStripeEvidence(env,stripeWrong),/amount or currency/);
});
test('fails if the second tenant can read first tenant invoice',async()=>{
 const bad = async (url,opts)=> {
  const result = await fixture(false)(url,opts);
  if(url.endsWith('/invoices') && opts.headers.cookie.includes(env.STRIPE_E2E_TENANT_B_COOKIE))
   return {status:200,json:async()=>[invoice]};
  return result;
 };
 await assert.rejects(()=>collectStripeEvidence(env,bad),/TENANT ISOLATION FAILURE/);
});
test('fails if second tenant can see payment ledger',async()=>{
 const bad = async (url,opts)=> {
  const result=await fixture(false)(url,opts);
  if(url.endsWith('/payments') && opts.headers.cookie.includes(env.STRIPE_E2E_TENANT_B_COOKIE))
   return {status:200,json:async()=>[{invoiceId}]};
  return result;
 };
 await assert.rejects(()=>collectStripeEvidence(env,bad),/TENANT ISOLATION FAILURE/);
});
test('fails paid verification when ledger has no payment',async()=>{
 const before=await collectStripeEvidence(env,fixture(false));
 const after=await collectStripeEvidence(env,fixture(true));
 assert.throws(()=>assertStripeVerified(before,{...after,paymentCount:0}),/exactly one/);
});
test('fails paid verification on duplicate ledger settlement',async()=>{
 const before=await collectStripeEvidence(env,fixture(false));
 const after=await collectStripeEvidence(env,fixture(true));
 assert.throws(()=>assertStripeVerified(before,{...after,paymentCount:2}),/exactly one/);
});
test('fails paid verification if subscription did not extend',async()=>{
 const before=await collectStripeEvidence(env,fixture(false));
 const after=await collectStripeEvidence(env,fixture(true));
 assert.throws(()=>assertStripeVerified(before,{...after,subscriptionPeriodEndsAt:before.subscriptionPeriodEndsAt}),/match the paid renewal/);
});
test('fails paid verification if Stripe payment intent differs from ledger',async()=>{
 const before=await collectStripeEvidence(env,fixture(false));
 const after=await collectStripeEvidence(env,fixture(true));
 assert.throws(()=>assertStripeVerified(before,{...after,stripePaymentIntent:'pi_SOMEOTHER'}),/matching Stripe settlement/);
});
test('fails paid verification if invoice dates have changed',async()=>{
 const before=await collectStripeEvidence(env,fixture(false));
 const after=await collectStripeEvidence(env,fixture(true));
 assert.throws(()=>assertStripeVerified(before,{...after,invoicePeriodEndsAt:'2027-01-01T00:00:00Z'}),/changed/);
});
test('rejects API failures and unprivileged cookies',async()=>{
 const bad=()=>Promise.resolve({status:401,json:async()=>({error:'unauthorized'})});
 await assert.rejects(()=>collectStripeEvidence(env,bad),/HTTP 401/);
});
test('uses GET-only, no redirect, and never calls write API',async()=>{
 const calls=[];
 const capture=(url,opts)=>{calls.push({url,opts});return fixture(false)(url,opts);};
 await collectStripeEvidence(env,capture);
 assert.equal(calls.length,6);
 assert.ok(calls.every(({opts})=>opts.method==='GET' && opts.redirect==='error'));
});

test('replay evidence remains identical after duplicate webhook delivery',async()=>{
 const first=await collectStripeEvidence(env,fixture(true));
 const afterReplay=await collectStripeEvidence(env,fixture(true));
 assert.equal(assertStripeReplayStable(first,afterReplay),true);
 assert.throws(()=>assertStripeReplayStable(first,{...afterReplay,paymentCount:2}),/duplicate settlement/);
 assert.throws(()=>assertStripeReplayStable(first,{...afterReplay,subscriptionPeriodEndsAt:'2027-01-01'}),/duplicate settlement/);
});
test('paid ledger amount must match invoice and Stripe amount',async()=>{
 const before=await collectStripeEvidence(env,fixture(false));
 const after=await collectStripeEvidence(env,fixture(true));
 assert.throws(()=>assertStripeVerified(before,{...after,paymentAmountMinor:14999}),/matching Stripe settlement/);
 assert.throws(()=>assertStripeVerified(before,{...after,paymentCurrency:'USD'}),/matching Stripe settlement/);
});

test('fails Stripe session bound to different tenant metadata',async()=>{
 const bad = async (url,opts)=>{
  const res=await fixture(false)(url,opts);
  if(url.startsWith('https://api.stripe.com'))
   return {status:200,json:async()=>({...stripe,metadata:{invoiceId,tenantId:'a379c8ee-e78c-4892-8d89-b015c714a71f'}})};
  return res;
 };
 await assert.rejects(()=>collectStripeEvidence(env,bad),/tenant metadata/);
});

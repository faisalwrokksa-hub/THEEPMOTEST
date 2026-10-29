import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { nextPeriod, mayInvoice, assertSettlement, verifyReferenceSignature, referenceBillingModeAllowed } from '../../../../apps/api/src/platform/billing-policy.ts';
const subscription={id:'sub', tenantId:'a', status:'active', periodEndsAt:'2026-11-01T00:00:00Z', cancelAtPeriodEnd:false};
const invoice={id:'inv', tenantId:'a', subscriptionId:'sub',status:'open',amountMinor:10500,currency:'SAR',periodStartsAt:'2026-11-01T00:00:00Z',periodEndsAt:'2026-12-01T00:00:00Z'};
const event={tenantId:'a',invoiceId:'inv',amountMinor:10500,currency:'SAR'};
test('monthly UTC rollover clamps January 31 to February 28',()=>assert.equal(nextPeriod('2027-01-31T00:00:00Z','monthly').endsAt,'2027-02-28T00:00:00.000Z'));
test('leap year annual period clamps Feb 29',()=>assert.equal(nextPeriod('2028-02-29T00:00:00Z','yearly').endsAt,'2029-02-28T00:00:00.000Z'));
test('canceled and expired plans cannot issue renewal invoice',()=>{assert.equal(mayInvoice({...subscription,status:'canceled'},'2026-10-25'),false);assert.equal(mayInvoice(subscription,'2026-11-05'),false);});
test('active subscription can invoice before renewal',()=>assert.equal(mayInvoice(subscription,'2026-10-25'),true));
test('matching invoice settlement accepted',()=>assert.equal(assertSettlement(invoice,event,subscription),true));
test('wrong tenant denied',()=>assert.throws(()=>assertSettlement(invoice,{...event,tenantId:'b'},subscription)));
test('wrong invoice denied',()=>assert.throws(()=>assertSettlement(invoice,{...event,invoiceId:'other'},subscription)));
test('wrong amount denied',()=>assert.throws(()=>assertSettlement(invoice,{...event,amountMinor:1},subscription)));
test('wrong currency denied',()=>assert.throws(()=>assertSettlement(invoice,{...event,currency:'USD'},subscription)));
test('canceled renewal denied',()=>assert.throws(()=>assertSettlement(invoice,event,{...subscription,cancelAtPeriodEnd:true})));
test('changed subscription period denied',()=>assert.throws(()=>assertSettlement(invoice,event,{...subscription,periodEndsAt:'2026-12-01T00:00:00Z'})));
test('paid invoice cannot settle twice',()=>assert.throws(()=>assertSettlement({...invoice,status:'paid'},event,subscription)));
test('signature validation allows signed raw bytes only',()=>{
  const secret='a'.repeat(40), raw=Buffer.from(JSON.stringify(event)), t='1792886400', now=1792886400_000;
  const sig='v1='+createHmac('sha256',secret).update(t).update('.').update(raw).digest('hex');
  assert.equal(verifyReferenceSignature(raw,t,sig,secret,now),true);
  assert.equal(verifyReferenceSignature(Buffer.from('changed'),t,sig,secret,now),false);
  assert.equal(verifyReferenceSignature(raw,t,sig,secret,now+301000),false);
  assert.equal(verifyReferenceSignature(raw,t,sig,'weak',now),false);
  assert.equal(verifyReferenceSignature(raw,t,'v1=abc',secret,now),false);
});

// P0: the HMAC-only simulator must not be deployable for paying customers.
test('reference settlement adapter rejected on production regardless of NODE_ENV', () => {
 for (const nodeEnv of ['production', 'development', 'test', undefined])
  assert.equal(referenceBillingModeAllowed(nodeEnv, 'production'), false);
});
test('reference settlement adapter rejected on staging and unknown environments', () => {
 for (const deployment of ['staging', 'prod', 'qa'])
  assert.equal(referenceBillingModeAllowed('development', deployment), false);
});
test('reference settlement adapter permitted only for local nonproduction tests', () => {
 assert.equal(referenceBillingModeAllowed('development', 'development'), true);
 assert.equal(referenceBillingModeAllowed('test', undefined), true);
 assert.equal(referenceBillingModeAllowed('production', 'development'), false);
 assert.equal(referenceBillingModeAllowed('production', undefined), false);
});

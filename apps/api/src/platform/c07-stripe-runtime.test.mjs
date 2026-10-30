import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { verifyStripeSignature, parsePaidStripeEvent } from './stripe-policy.ts';
const secret = 'whsec_12345678901234567890123456789012';
const now = 1761436800000;
const timestamp = Math.floor(now / 1000);
const session = { id:'cs_test_ABC123', object:'checkout.session', livemode:false, mode:'payment', status:'complete', payment_status:'paid' };
const event = (payment_status='paid') => Buffer.from(JSON.stringify({ id:'evt_ABC123', type:'checkout.session.completed', livemode:false, data:{object:{...session,payment_status}} }));
const signed = body => 't=' + timestamp + ',v1=' + createHmac('sha256',secret).update(String(timestamp)).update('.').update(body).digest('hex');
test('signed Stripe payload is accepted; malformed signature headers are rejected', () => {
  const body = event(); const header = signed(body);
  assert.equal(verifyStripeSignature(body,header,secret,now),true);
  for (const invalid of [header+',', ','+header, header+',,v0=ignored',header.replace('t='+timestamp,'t='+timestamp+',t='+timestamp)])
    assert.equal(verifyStripeSignature(body,invalid,secret,now),false,invalid);
  assert.equal(verifyStripeSignature(Buffer.concat([body,Buffer.from(' ')]),header,secret,now),false);
});
test('paid checkout accepted, unpaid and async-pending checkout ignored', () => {
  assert.equal(parsePaidStripeEvent(event('paid'),false)?.session.id,session.id);
  for (const state of ['unpaid','no_payment_required']) assert.equal(parsePaidStripeEvent(event(state),false),null);
  assert.throws(() => parsePaidStripeEvent(event(),true));
});

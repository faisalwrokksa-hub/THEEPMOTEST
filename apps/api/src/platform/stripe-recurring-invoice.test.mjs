import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { verifyStripeSignature } from './stripe-policy.ts';
import { parsePaidRecurringInvoice } from './stripe-recurring-invoice.ts';

const secret = 'whsec_12345678901234567890123456789012';
const invoice = {
  id: 'in_ABC123', object: 'invoice', livemode: false, status: 'paid',
  paid: true, collection_method: 'charge_automatically',
  billing_reason: 'subscription_create', customer: 'cus_ABC123',
  subscription: 'sub_ABC123', amount_due: 12000, amount_paid: 12000,
  currency: 'sar', metadata: { tenantId: 'UNTRUSTED' },
};
const event = (object = invoice, type = 'invoice.paid', livemode = false) =>
  Buffer.from(JSON.stringify({ id: 'evt_RECURRING123', type, livemode, data: { object } }));

test('signed recurring invoice is a candidate only, with no trusted tenant ID', () => {
  const raw = event();
  const timestamp = 1761900000;
  const signature = createHmac('sha256', secret)
    .update(String(timestamp)).update('.').update(raw).digest('hex');
  assert.equal(verifyStripeSignature(raw, `t=${timestamp},v1=${signature}`,
    secret, timestamp * 1000), true);
  assert.deepEqual(parsePaidRecurringInvoice(raw, false), {
    eventId: 'evt_RECURRING123', invoiceId: 'in_ABC123',
    subscriptionId: 'sub_ABC123', customerId: 'cus_ABC123',
    amountMinor: 12000, currency: 'SAR', billingReason: 'subscription_create',
  });
});

test('newer Stripe invoice parent subscription reference is accepted', () => {
  const { subscription, ...withoutOld } = invoice;
  const newer = { ...withoutOld,
    parent: { subscription_details: { subscription: 'sub_ABC123' } },
    billing_reason: 'subscription_cycle' };
  assert.equal(parsePaidRecurringInvoice(event(newer), false)?.subscriptionId, 'sub_ABC123');
  assert.throws(() => parsePaidRecurringInvoice(event({
    ...invoice, parent: { subscription_details: { subscription: 'sub_DIFFERENT' } },
  }), false));
});

test('unrelated Stripe events are not recurring paid invoices', () => {
  assert.equal(parsePaidRecurringInvoice(event(invoice, 'invoice.created'), false), null);
  assert.equal(parsePaidRecurringInvoice(event(invoice, 'checkout.session.completed'), false), null);
});

test('partial, unpaid, wrong mode or non-recurring invoices fail closed', () => {
  const variants = [
    { ...invoice, livemode: true },
    { ...invoice, status: 'open' }, { ...invoice, paid: false },
    { ...invoice, collection_method: 'send_invoice' },
    { ...invoice, billing_reason: 'manual' },
    { ...invoice, billing_reason: 'subscription_update' },
    { ...invoice, customer: 'bad' }, { ...invoice, subscription: 'bad' },
    { ...invoice, amount_due: 0 }, { ...invoice, amount_paid: 11999 },
    { ...invoice, currency: 'sar!' },
  ];
  for (const variant of variants)
    assert.throws(() => parsePaidRecurringInvoice(event(variant), false));
  assert.throws(() => parsePaidRecurringInvoice(event(invoice, 'invoice.paid', true), false));
  assert.throws(() => parsePaidRecurringInvoice(Buffer.from('{bad'), false));
});

test('recurring invoice parser has no entitlement or database mutation side effects', () => {
  const source = readFileSync(new URL('./stripe-recurring-invoice.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /withTenant\(|UPDATE tenant_subscriptions|INSERT INTO billing_payments/);
  assert.match(source, /MUST verify the raw Stripe signature/);
});

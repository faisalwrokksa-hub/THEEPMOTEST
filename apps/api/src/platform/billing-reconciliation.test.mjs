import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcileInvoice } from './billing-reconciliation.ts';
const base = {
  invoiceId: 'invoice-1', status: 'paid', amountMinor: 5000, currency: 'SAR',
  periodStartsAt: '2026-11-01T00:00:00Z', paidAt: '2026-10-20T00:00:00Z',
  paymentId: 'payment-1', paymentAmountMinor: 5000, paymentCurrency: 'SAR',
};
test('matched paid invoice and ledger are not flagged', () => assert.deepEqual(reconcileInvoice(base, '2026-10-26'), []));
test('paid without ledger row is flagged', () => assert.ok(reconcileInvoice({ ...base, paymentId: null, paymentAmountMinor: null, paymentCurrency: null }).includes('paid_without_payment')));
test('open invoice with payment is flagged', () => assert.ok(reconcileInvoice({ ...base, status: 'open', paidAt: null }).includes('payment_without_paid_invoice')));
test('void invoice with payment is flagged', () => assert.ok(reconcileInvoice({ ...base, status: 'void', paidAt: null }).includes('payment_without_paid_invoice')));
test('payment amount mismatch is flagged', () => assert.ok(reconcileInvoice({ ...base, paymentAmountMinor: 4000 }).includes('payment_amount_mismatch')));
test('payment currency mismatch is flagged', () => assert.ok(reconcileInvoice({ ...base, paymentCurrency: 'USD' }).includes('payment_currency_mismatch')));
test('paid timestamp absent is flagged', () => assert.ok(reconcileInvoice({ ...base, paidAt: null }).includes('paid_timestamp_mismatch')));
test('unpaid invoice with paid timestamp is flagged', () => assert.ok(reconcileInvoice({ ...base, status: 'open' }).includes('paid_timestamp_mismatch')));
test('open invoice not yet due is not flagged', () => assert.deepEqual(reconcileInvoice({ ...base, status: 'open', paidAt: null, paymentId: null, paymentAmountMinor: null, paymentCurrency: null }, '2026-10-26'), []));
test('overdue open invoice is flagged', () => assert.ok(reconcileInvoice({ ...base, status: 'open', paidAt: null, paymentId: null, paymentAmountMinor: null, paymentCurrency: null }, '2026-11-02').includes('overdue_open_invoice')));
test('invalid dates fail closed', () => assert.throws(() => reconcileInvoice({ ...base, periodStartsAt: 'not-a-date' })));

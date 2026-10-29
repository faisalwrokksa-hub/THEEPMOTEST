/**
 * Read-only invoice/settlement consistency checks.
 * This is not a payment-provider reconciliation or proof that a charge cleared.
 */
export type InvoiceLedgerRow = {
  invoiceId: string;
  status: 'open' | 'paid' | 'void';
  amountMinor: number;
  currency: string;
  periodStartsAt: Date | string;
  paidAt: Date | string | null;
  paymentId: string | null;
  paymentAmountMinor: number | null;
  paymentCurrency: string | null;
};

export type BillingIssue =
  | 'paid_without_payment'
  | 'payment_without_paid_invoice'
  | 'payment_amount_mismatch'
  | 'payment_currency_mismatch'
  | 'paid_timestamp_mismatch'
  | 'overdue_open_invoice';

export function reconcileInvoice(row: InvoiceLedgerRow, now: Date | string = new Date()): BillingIssue[] {
  const issues: BillingIssue[] = [];
  const hasPayment = row.paymentId !== null;
  if (row.status === 'paid' && !hasPayment) issues.push('paid_without_payment');
  if (row.status !== 'paid' && hasPayment) issues.push('payment_without_paid_invoice');
  if (hasPayment) {
    if (row.paymentAmountMinor !== row.amountMinor) issues.push('payment_amount_mismatch');
    if (row.paymentCurrency !== row.currency) issues.push('payment_currency_mismatch');
  }
  if ((row.status === 'paid') !== (row.paidAt !== null)) issues.push('paid_timestamp_mismatch');
  const due = new Date(row.periodStartsAt).getTime();
  const clock = new Date(now).getTime();
  if (!Number.isFinite(due) || !Number.isFinite(clock)) throw new Error('Invalid reconciliation date');
  if (row.status === 'open' && due < clock) issues.push('overdue_open_invoice');
  return issues;
}

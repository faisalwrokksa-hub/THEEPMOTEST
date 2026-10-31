/**
 * C31: derive a single captured PaymentIntent lookup reference from the
 * independently retrieved Stripe Invoice, never from unsigned metadata.
 * Reject truncated payment lists and conflicting API-version references.
 */
const paymentId = (value: unknown): string | null => {
  const id = typeof value === 'string' ? value :
    value && typeof value === 'object' && typeof (value as { id?: unknown }).id === 'string'
      ? (value as { id: string }).id : null;
  return id && /^pi_[A-Za-z0-9]+$/.test(id) ? id : null;
};

export function recurringInvoicePaymentIntentId(invoiceValue: unknown): string {
  const invoice = invoiceValue as any;
  if (!invoice || invoice.object !== 'invoice')
    throw new Error('Invalid recurring invoice payment reference');
  const legacy = invoice.payment_intent == null ? null : paymentId(invoice.payment_intent);
  if (invoice.payment_intent != null && !legacy)
    throw new Error('Invalid recurring invoice PaymentIntent');
  let fromPayments: string | null = null;
  if (invoice.payments != null) {
    const page = invoice.payments;
    if (!Array.isArray(page.data) || page.data.length !== 1 ||
        (page.has_more !== undefined && page.has_more !== false) ||
        (page.total_count !== undefined && page.total_count !== 1))
      throw new Error('Ambiguous or incomplete recurring invoice payments');
    fromPayments = paymentId(page.data[0]?.payment?.payment_intent);
    if (!fromPayments)
      throw new Error('Recurring invoice payment is not a PaymentIntent');
  }
  if (legacy && fromPayments && legacy !== fromPayments)
    throw new Error('Conflicting recurring invoice payment references');
  const id = legacy ?? fromPayments;
  if (!id) throw new Error('Recurring invoice has no captured PaymentIntent reference');
  return id;
}

/** A checkout redirect is informational; only the server webhook settles invoices. */
export function checkoutReturnStatus(value) {
  if (value === 'success') return 'awaiting-webhook';
  if (value === 'cancelled' || value === 'cancel') return 'cancelled';
  return null;
}

/** Fail-closed display guidance. Entitlements remain exclusively server verified. */
export function billingChangeGuidance(action, eligible, locale = 'en') {
  const allowed = new Set(['issue-invoice', 'schedule-cancellation', 'resume']);
  if (!allowed.has(action) || eligible !== true) return null;
  const ar = locale === 'ar';
  return action === 'issue-invoice'
    ? (ar ? 'إصدار الفاتورة لا يفعّل اشتراكاً أو يسحب مبلغاً؛ تُفعّل المزايا بعد تحقق الدفع.' : 'Creating an invoice does not charge a card or activate access; verified payment is required.')
    : action === 'schedule-cancellation'
      ? (ar ? 'يُجدول الإلغاء عند نهاية الفترة، بعد تأكيد الخادم.' : 'Cancellation is scheduled at period end only after server confirmation.')
      : (ar ? 'إلغاء طلب الإلغاء يتطلب تأكيد الخادم.' : 'Resuming requires server confirmation.');
}

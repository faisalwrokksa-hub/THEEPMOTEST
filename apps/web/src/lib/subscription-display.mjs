/** Read-only customer presentation rules. Server API remains the licensing authority. */
export const SUBSCRIPTION_STATUSES = Object.freeze(['trialing', 'active', 'past_due', 'paused', 'canceled', 'expired']);

export function effectiveSubscriptionStatus(subscription, now = new Date()) {
  if (!subscription) return 'none';
  if (!SUBSCRIPTION_STATUSES.includes(subscription.status)) return 'unknown';
  const nowMs = new Date(now).getTime();
  const startMs = Date.parse(subscription.periodStartsAt ?? '');
  const endMs = Date.parse(subscription.periodEndsAt ?? '');
  if (![nowMs, startMs, endMs].every(Number.isFinite) || endMs <= startMs) return 'unknown';
  if (nowMs < startMs) return 'upcoming';
  if (subscription.status === 'trialing') {
    const trialMs = Date.parse(subscription.trialEndsAt ?? '');
    if (!Number.isFinite(trialMs)) return 'unknown';
    return nowMs >= Math.min(trialMs, endMs) ? 'expired' : 'trialing';
  }
  if (subscription.status === 'active' && nowMs >= endMs) return 'expired';
  return subscription.status;
}

export function daysUntil(isoDate, now = new Date()) {
  if (!isoDate) return null;
  const end = Date.parse(isoDate);
  const start = new Date(now).getTime();
  if (!Number.isFinite(end) || !Number.isFinite(start)) return null;
  return Math.max(0, Math.ceil((end - start) / 86_400_000));
}

export function formatBillingMoney(minor, currency, locale = 'en') {
  if (!Number.isSafeInteger(minor) || minor < 0 || typeof currency !== 'string' || !/^[A-Z]{3}$/.test(currency)) return '—';
  try {
    const language = locale === 'ar' ? 'ar-SA' : 'en-US';
    const fmt = new Intl.NumberFormat(language, { style: 'currency', currency });
    const fraction = fmt.resolvedOptions().maximumFractionDigits;
    return fmt.format(minor / (10 ** fraction));
  } catch { return '—'; }
}

export function formatBillingDate(date, locale = 'en') {
  const parsed = new Date(date ?? '');
  if (!Number.isFinite(parsed.getTime())) return '—';
  return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-SA' : 'en-US', {
    year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC',
  }).format(parsed);
}

/** UI hints only. Eligibility is rechecked transactionally by the API. */
export function availableBillingActions(subscription, now = new Date()) {
  const status = effectiveSubscriptionStatus(subscription, now);
  return {
    invoice: ['trialing', 'active'].includes(status) && !subscription?.cancelAtPeriodEnd,
    scheduleCancellation: ['trialing', 'active'].includes(status) && !subscription?.cancelAtPeriodEnd,
    resume: ['trialing', 'active'].includes(status) && subscription?.cancelAtPeriodEnd === true,
  };
}

// Phase 12 Milestone 2B: deterministic subscription lifecycle decisions.
// Pure functions; database writes, payments, and authorization must be handled by callers.
export const STATUSES = Object.freeze(['trialing','active','past_due','paused','canceled','expired']);
const validDate = value => {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error('Invalid subscription date');
  return date;
};
export function subscriptionAccess(subscription, now = new Date()) {
  if (!subscription) return { allowed: false, reason: 'no_subscription' };
  if (!STATUSES.includes(subscription.status)) return { allowed: false, reason: 'invalid_status' };
  const clock = validDate(now).getTime();
  const start = validDate(subscription.periodStartsAt).getTime();
  const end = validDate(subscription.periodEndsAt).getTime();
  if (end <= start) return { allowed: false, reason: 'invalid_period' };
  if (clock < start) return { allowed: false, reason: 'not_started' };
  if (subscription.status === 'trialing') {
    if (!subscription.trialEndsAt || clock >= validDate(subscription.trialEndsAt).getTime() || clock >= end)
      return { allowed: false, reason: 'trial_ended' };
    return { allowed: true, reason: 'trial' };
  }
  if (subscription.status !== 'active') return { allowed: false, reason: subscription.status };
  if (clock >= end) return { allowed: false, reason: 'period_ended' };
  return { allowed: true, reason: 'active' };
}
export function moduleAccess(subscription, moduleEnabled, moduleExpiresAt, now = new Date()) {
  const access = subscriptionAccess(subscription, now);
  if (!access.allowed) return access;
  if (!moduleEnabled) return { allowed: false, reason: 'module_disabled' };
  if (moduleExpiresAt && validDate(now).getTime() >= validDate(moduleExpiresAt).getTime())
    return { allowed: false, reason: 'module_expired' };
  return { allowed: true, reason: 'licensed' };
}
export function renewalDecision(subscription, now = new Date()) {
  const clock = validDate(now).getTime();
  const end = validDate(subscription.periodEndsAt).getTime();
  if (clock < end) return 'not_due';
  if (subscription.cancelAtPeriodEnd || ['canceled','paused','expired'].includes(subscription.status)) return 'expire';
  if (subscription.status === 'active' || subscription.status === 'trialing') return 'requires_payment_confirmation';
  return 'manual_review';
}

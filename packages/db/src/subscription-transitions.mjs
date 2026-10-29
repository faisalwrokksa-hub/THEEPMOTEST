// Deterministic subscription state transitions. Payment confirmation is a mandatory
// external fact, never inferred from an elapsed period or user request.
import { subscriptionAccess } from './subscription-lifecycle.mjs';
const date = v => { const d = new Date(v); if (!Number.isFinite(d.getTime())) throw Error('Invalid date'); return d; };
export function transition(subscription, action, options = {}) {
  if (!subscription || !subscription.id || !subscription.tenantId) throw Error('Tenant subscription required');
  const now = date(options.now ?? new Date());
  const next = { ...subscription };
  switch (action) {
    case 'cancel_at_period_end':
      if (!['trialing','active','past_due'].includes(next.status)) throw Error('Cannot schedule cancellation');
      next.cancelAtPeriodEnd = true; break;
    case 'resume':
      if (!['trialing','active'].includes(next.status) || date(next.periodEndsAt) <= now) throw Error('Cannot resume');
      next.cancelAtPeriodEnd = false; break;
    case 'cancel_now':
      if (['canceled','expired'].includes(next.status)) throw Error('Already terminated');
      next.status = 'canceled'; next.canceledAt = now.toISOString(); break;
    case 'expire':
      if (date(next.periodEndsAt) > now && !(next.status === 'trialing' && next.trialEndsAt && date(next.trialEndsAt) <= now))
        throw Error('Subscription not due for expiration');
      next.status = 'expired'; break;
    case 'renew':
      if (next.cancelAtPeriodEnd || ['canceled','expired','paused'].includes(next.status)) throw Error('Cannot renew');
      if (!options.paymentConfirmed || !options.paymentReference) throw Error('Verified payment reference required');
      if (date(options.periodStartsAt) < date(next.periodEndsAt)) throw Error('Renewal overlaps existing period');
      if (date(options.periodEndsAt) <= date(options.periodStartsAt)) throw Error('Invalid renewal period');
      next.status = 'active'; next.periodStartsAt = date(options.periodStartsAt).toISOString();
      next.periodEndsAt = date(options.periodEndsAt).toISOString(); next.trialEndsAt = null;
      next.paymentReference = options.paymentReference; break;
    default: throw Error('Unsupported transition');
  }
  return next;
}
export function effectiveStatus(subscription, now = new Date()) {
  if (!subscription) return 'missing';
  const access = subscriptionAccess(subscription, now);
  if (access.allowed) return subscription.status;
  if (['active','trialing'].includes(subscription.status) && ['period_ended','trial_ended'].includes(access.reason)) return 'expired';
  return subscription.status;
}

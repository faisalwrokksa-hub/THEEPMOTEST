import test from 'node:test';
import assert from 'node:assert/strict';
import {
  effectiveSubscriptionStatus, daysUntil, formatBillingMoney,
  formatBillingDate, availableBillingActions,
} from './subscription-display.mjs';
const current = { status: 'active', periodStartsAt: '2026-10-01T00:00:00Z', periodEndsAt: '2026-11-01T00:00:00Z', cancelAtPeriodEnd: false };
const now = new Date('2026-10-26T10:00:00Z');
test('missing subscription is presented as none', () => assert.equal(effectiveSubscriptionStatus(null, now), 'none'));
test('active subscription shows active within period', () => assert.equal(effectiveSubscriptionStatus(current, now), 'active'));
test('active subscription past period displays expired', () => assert.equal(effectiveSubscriptionStatus(current, '2026-11-01T00:00:00Z'), 'expired'));
test('trial inside period displays trialing', () => assert.equal(effectiveSubscriptionStatus({ ...current, status: 'trialing', trialEndsAt: '2026-10-30T00:00:00Z' }, now), 'trialing'));
test('trial beyond deadline displays expired', () => assert.equal(effectiveSubscriptionStatus({ ...current, status: 'trialing', trialEndsAt: '2026-10-25T00:00:00Z' }, now), 'expired'));
test('trial without deadline cannot be shown as valid', () => assert.equal(effectiveSubscriptionStatus({ ...current, status: 'trialing' }, now), 'unknown'));
test('invalid subscription dates never show active', () => assert.equal(effectiveSubscriptionStatus({ ...current, periodEndsAt: 'bad' }, now), 'unknown'));
test('future start is clearly upcoming', () => assert.equal(effectiveSubscriptionStatus({ ...current, periodStartsAt: '2026-10-30T00:00:00Z' }, now), 'upcoming'));
test('past_due status stays past_due', () => assert.equal(effectiveSubscriptionStatus({ ...current, status: 'past_due' }, now), 'past_due'));
test('days rounded up and clamped to zero', () => { assert.equal(daysUntil('2026-10-26T10:00:01Z', now), 1); assert.equal(daysUntil('2026-10-25T00:00:00Z', now), 0); });
test('invalid date returns null', () => assert.equal(daysUntil('invalid-date', now), null));
test('currencies with two decimals use ISO fraction', () => assert.match(formatBillingMoney(12345, 'SAR'), /123[.,]45/));
test('zero-decimal currency uses correct units', () => assert.match(formatBillingMoney(12345, 'JPY'), /12[,.]?345/));
test('invalid money does not display price', () => assert.equal(formatBillingMoney(-1, 'SAR'), '—'));
test('invalid currency fails closed', () => assert.equal(formatBillingMoney(100, 'INVALID'), '—'));
test('Arabic prices use Arabic locale', () => assert.notEqual(formatBillingMoney(12345, 'SAR', 'ar'), '—'));
test('billing dates are UTC-consistent', () => assert.equal(formatBillingDate('2026-11-01T00:00:00Z', 'en'), 'Nov 1, 2026'));
test('invalid dates have a safe fallback', () => assert.equal(formatBillingDate('not-a-date'), '—'));
test('active subscription permits cancellation and invoicing', () => assert.deepEqual(availableBillingActions(current, now), { invoice: true, scheduleCancellation: true, resume: false }));
test('scheduled cancellation only offers resumption', () => assert.deepEqual(availableBillingActions({ ...current, cancelAtPeriodEnd: true }, now), { invoice: false, scheduleCancellation: false, resume: true }));
test('expired subscription offers no actions', () => assert.deepEqual(availableBillingActions(current, '2026-11-03T00:00:00Z'), { invoice: false, scheduleCancellation: false, resume: false }));
test('no subscription offers no actions', () => assert.deepEqual(availableBillingActions(null, now), { invoice: false, scheduleCancellation: false, resume: false }));

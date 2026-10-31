import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { onboardingFailurePath, onboardingFeedback } from './onboarding-failure-feedback.mjs';

test('expired onboarding session requires sign-in, not a false success', () => {
  assert.equal(onboardingFailurePath(401), '/login?error=expired');
});

test('permission, conflict, throttle and uncertain outcomes use fixed codes', () => {
  for (const [status, expected] of [
    [403, 'forbidden'], [409, 'conflict'], [429, 'rate_limited'],
    [400, 'failed'], [422, 'failed'], [500, 'unavailable'],
    [503, 'unavailable'], [504, 'unavailable'],
    [null, 'unavailable'], [undefined, 'unavailable'],
    [NaN, 'unavailable'], [Infinity, 'unavailable'],
  ]) assert.equal(onboardingFailurePath(status), '/settings?onboarding=' + expected);
});

test('onboarding failures are bilingual, bounded and never reflect query values', () => {
  for (const code of ['forbidden', 'conflict', 'rate_limited', 'unavailable', 'failed']) {
    const en = onboardingFeedback(code, 'en');
    const ar = onboardingFeedback(code, 'ar');
    assert.match(en, /not saved|could not be confirmed/i);
    assert.match(ar, /لم تُحفظ|تعذّر/);
    assert.ok(en.length < 180 && ar.length < 180);
  }
  for (const code of [null, undefined, '', '__proto__', 'constructor',
    'token=secret', '<script>', ['failed'], 'failed\nSet-Cookie: x']) {
    assert.equal(onboardingFeedback(code, 'en'), null);
  }
});

test('onboarding route never forwards untrusted errors or mislabels denied writes', () => {
  const route = readFileSync(new URL('../app/api/onboarding/route.ts', import.meta.url), 'utf8');
  const settings = readFileSync(new URL('../app/(app)/settings/page.tsx', import.meta.url), 'utf8');
  assert.match(route, /rejectUnsafeBrowserMutation\(req\)/);
  assert.match(route, /readBoundedBrowserForm\(req\)/);
  assert.match(route, /fetchTenantMutation\(fetch,/);
  assert.match(route, /onboardingFailurePath\(result\?\.status\)/);
  assert.match(route, /onboardingFailurePath\(400\)/);
  assert.match(route, /publicUrl\(req, onboardingFailurePath/);
  assert.doesNotMatch(route, /target\.searchParams\.set\('error'/);
  assert.doesNotMatch(route, /result\?\.json\(\)/);
  assert.match(settings, /onboardingFeedback\(onboardingStatus, lang\)/);
  assert.match(settings, /onboardingMessage && <p[^>]*role="alert"/);
  assert.doesNotMatch(settings, /\{onboardingStatus\}/);
});

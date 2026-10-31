import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  journeyConfiguration, JOURNEY_VARIANTS, assertJourneyLayout, assertMutationRedirect,
} from './frontend-customer-journey-policy.mjs';

const env = {
  EPMO_UAT_URL: 'http://127.0.0.1:3000',
  EPMO_UAT_OUT: '/tmp/epmo-f44-journey',
  EPMO_JOURNEY_ADMIN_USER: 'owner@synthetic.test',
  EPMO_JOURNEY_ADMIN_PASSWORD: 'dummy-secret-one',
  EPMO_JOURNEY_RESTRICTED_USER: 'viewer@synthetic.test',
  EPMO_JOURNEY_RESTRICTED_PASSWORD: 'dummy-secret-two',
};

test('F44 only accepts two distinct synthetic identities and local origin', () => {
  assert.equal(journeyConfiguration(env).admin, env.EPMO_JOURNEY_ADMIN_USER);
  assert.throws(() => journeyConfiguration({ ...env, EPMO_UAT_URL: 'https://staging.theepmo.com' }), /loopback HTTP/);
  assert.throws(() => journeyConfiguration({ ...env, EPMO_JOURNEY_ADMIN_USER: 'real@gmail.com' }), /synthetic/);
  assert.throws(() => journeyConfiguration({ ...env, EPMO_JOURNEY_RESTRICTED_USER: 'OWNER@synthetic.test' }), /distinct/);
  assert.throws(() => journeyConfiguration({ ...env, EPMO_JOURNEY_RESTRICTED_PASSWORD: '' }), /passwords/);
});

test('F44 browser assertions fail closed on mobile Arabic overflow and wrong direction', () => {
  assert.deepEqual(JOURNEY_VARIANTS.map(v => [v.width, v.lang, v.dir]), [[375,'ar','rtl'],[1440,'en','ltr']]);
  assert.doesNotThrow(() => assertJourneyLayout({ lang: 'ar', dir: 'rtl', heading: true, scrollWidth: 375 }, JOURNEY_VARIANTS[0]));
  assert.throws(() => assertJourneyLayout({ lang: 'ar', dir: 'ltr', heading: true, scrollWidth: 375 }, JOURNEY_VARIANTS[0]), /locale_direction_failed/);
  assert.throws(() => assertJourneyLayout({ lang: 'ar', dir: 'rtl', heading: true, scrollWidth: 390 }, JOURNEY_VARIANTS[0]), /horizontal_overflow/);
  assert.throws(() => assertJourneyLayout({ lang: 'ar', dir: 'rtl', heading: false, scrollWidth: 375 }, JOURNEY_VARIANTS[0]), /missing_heading/);
});

test('F44 never accepts successful, external, or ambiguous 401/403 redirects', () => {
  const origin = env.EPMO_UAT_URL;
  const expired = { path: '/login', key: 'error', value: 'expired' };
  const forbidden = { path: '/settings', key: 'onboarding', value: 'forbidden' };
  assert.doesNotThrow(() => assertMutationRedirect(303, '/login?error=expired', origin, expired));
  assert.doesNotThrow(() => assertMutationRedirect(303, '/settings?onboarding=forbidden', origin, forbidden));
  for (const [status, url] of [[200,'/login?error=expired'],[303,'https://evil.example/login?error=expired'],[303,'/login?error=invalid'],[303,'/login?error=expired&token=leak'],[303,'/login?error=expired#secret']]) {
    assert.throws(() => assertMutationRedirect(status, url, origin, expired));
  }
});

test('F44 frontend route explains missing-cookie 401 without exposing input', async () => {
  const route = await readFile(new URL('../apps/web/src/app/api/onboarding/route.ts', import.meta.url), 'utf8');
  assert.match(route, /if \(!session\) return NextResponse\.redirect\(publicUrl\(req, onboardingFailurePath\(401\)\), 303\)/);
  assert.match(route, /onboardingFailurePath\(result\?\.status\)/);
});

test('F44 executable browser suite checks real local 401, 403 and both customer roles', async () => {
  const source = await readFile(new URL('./frontend-customer-journey.mjs', import.meta.url), 'utf8');
  for (const item of ['expired_onboarding_cookie_rejected', 'restricted_onboarding_403', 'admin_subscription_read', 'invitation_403_no_acceptance', 'recovery_503_no_success']) {
    assert.ok(source.includes(item), 'Missing journey: ' + item);
  }
  assert.ok(!source.includes('context.tracing.start('), 'Never trace authenticated cookies or credentials');
  assert.ok(source.includes('maxRedirects: 0'), 'Negative mutation must inspect actual redirect');
});

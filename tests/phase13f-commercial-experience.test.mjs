import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const root = new URL('../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const billing = read('apps/web/src/app/(app)/billing/page.tsx');
const api = read('apps/web/src/lib/api.ts');
const subscriptionService = read('apps/api/src/platform/subscription.service.ts');
const proxy = read('apps/web/src/app/api/billing/subscription/route.ts');
const doc = read('PHASE13F_COMMERCIAL_EXPERIENCE.md');

test('billing page requires authenticated workspace administrator capability', () => {
  assert.match(billing, /!session\.authenticated/);
  assert.match(billing, /!session\.capabilities\.includes\('pmoa_admin'\)/);
});
test('plans and subscription are fetched through tenant-aware API', () => {
  assert.match(api, /subscriptionCurrent: \(\) => get<.*>\('\/api\/v1\/subscription\/current'\)/);
  assert.match(api, /subscriptionPlans: \(\) => get<.*>\('\/api\/v1\/subscription\/plans'\)/);
  assert.match(subscriptionService, /withTenant\(tenantId/);
});
test('subscription read includes pricing metadata', () => {
  for (const field of ['planName', 'priceMinor', 'billingInterval']) assert.ok(subscriptionService.includes(`"${field}"`), field);
  assert.match(subscriptionService, /p\.currency/);
});
test('payment does not activate licenses on browser redirect', () => {
  assert.match(billing, /verifies Stripe’s payment webhook/);
  assert.doesNotMatch(billing, /confirmPaymentFromQuery/);
});
test('form actions use existing safe mutation proxy', () => {
  assert.match(proxy, /rejectUnsafeBrowserMutation\(req\)/);
  assert.match(proxy, /publicUrl\(req, '\/billing'\)/);
  assert.match(proxy, /action === 'schedule-cancellation'/);
  assert.match(proxy, /action === 'resume'/);
  assert.match(proxy, /method: 'POST'/);
});
test('mutation proxy cannot accept caller-selected tenant ids or external URLs', () => {
  assert.doesNotMatch(proxy, /tenantId|tenant_id|redirectUrl|returnUrl/);
  assert.match(proxy, /const path = action ===/);
});
test('plans are display-only, not secretly self-activating', () => {
  assert.match(billing, /Selecting a plan here does not change your subscription/);
  assert.doesNotMatch(billing, /\bactivatePlan\(/);
});
test('trial and cancellation instructions are bilingual', () => {
  assert.match(billing, /trialEndsAt/);
  assert.match(billing, /الفترة التجريبية/);
  assert.match(billing, /الإلغاء عند نهاية الفترة/);
  assert.match(billing, /الاشتراك والفوترة/);
});
test('customer docs explicitly describe staging gap', () => {
  assert.match(doc, /not production verified/i);
  assert.match(doc, /PostgreSQL/);
  assert.match(doc, /Stripe/);
});
const onboarding = read('apps/web/src/app/(app)/getting-started/page.tsx');
test('getting started displays trial guidance only to authorized admins', () => {
  assert.match(onboarding, /session\.capabilities\.includes\('pmoa_admin'\)/);
  assert.match(onboarding, /licenseStatus === 'trialing'/);
  assert.match(onboarding, /licenseStatus === 'expired'/);
  assert.match(onboarding, /href="\/billing"/);
});
test('billing customer guides exist in both languages and clearly separate payments from invoice creation', () => {
  const english = read('docs/customer/billing-guide.en.md');
  const arabic = read('docs/customer/billing-guide.ar.md');
  assert.match(english, /not proof.*payment/i);
  assert.match(english, /Stripe/);
  assert.match(arabic, /Stripe/);
  assert.match(arabic, /لا.*تجدد/);
});

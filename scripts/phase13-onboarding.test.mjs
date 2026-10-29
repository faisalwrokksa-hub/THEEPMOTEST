import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const src = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const svc = src('apps/api/src/onboarding/onboarding.service.ts');
const controller = src('apps/api/src/onboarding/onboarding.controller.ts');
const module = src('apps/api/src/onboarding/onboarding.module.ts');
const app = src('apps/api/src/app.module.ts');
const nav = src('apps/web/src/lib/nav.ts');
const navModules = src('packages/contracts/src/modules.ts');
const page = src('apps/web/src/app/(app)/getting-started/page.tsx');
const client = src('apps/web/src/lib/api.ts');

test('onboarding requires authenticated read permission', () => {
  assert.match(svc, /requireCapability\('read'\)/);
  assert.match(svc, /currentContext\(\)/);
  assert.match(svc, /withTenant\(tenantId,/);
});
test('tenant ID is not accepted from query or body', () => {
  assert.match(controller, /@Get\('status'\)/);
  assert.match(controller, /@Get\('status'\) status\(\)/);
  assert.doesNotMatch(controller, /status\([^)]*(tenantId|req|query)/);
  assert.match(svc, /const \{ tenantId \} = currentContext\(\)/);
});
test('all five aggregate queries use tenant predicates', () => {
  for (const table of ['memberships','portfolios','programs','projects']) {
    assert.match(svc, new RegExp(`FROM ${table}\\s+\\w+ WHERE \\w+\\.tenant_id = \\$\\{tenantId\\}`));
  }
  assert.match(svc, /FROM tenants t LEFT JOIN tenant_profiles p ON p\.tenant_id = t\.id\s+WHERE t\.id = \$\{tenantId\}/);
});
test('the route is enabled as a core module endpoint', () => {
  assert.match(app, /OnboardingModule/);
  assert.match(module, /OnboardingController/);
  assert.match(controller, /@Controller\('api\/v1\/onboarding'\)/);
  assert.doesNotMatch(controller, /@RequiresModule\(/);
});
test('navigation is core and visible with read capability', () => {
  assert.match(nav, /key: 'getting-started'.*href: '\/getting-started', cap: 'read'/);
  assert.match(navModules, /'getting-started': 'core360'/);
});
test('web page shows bilingual status and restricts create links by capabilities', () => {
  assert.match(page, /getLang\(\)/);
  assert.match(page, /can\(capabilities, task\.capability\)/);
  assert.match(page, /دعوات آمنة عبر البريد الإلكتروني/);
  assert.match(page, /secure, 72-hour email links/);
  assert.match(client, /\/api\/v1\/onboarding\/status/);
});

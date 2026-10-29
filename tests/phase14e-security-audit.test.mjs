import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const subscription = source('apps/api/src/platform/subscription.service.ts');
const billing = source('apps/api/src/platform/billing.service.ts');
const stripe = source('apps/api/src/platform/stripe.service.ts');
const admin = source('apps/api/src/platform/super-admin.service.ts');
const platform = source('apps/api/src/platform/platform.service.ts');
const nav = source('apps/web/src/lib/nav.ts');
const page = source('apps/web/src/app/(app)/billing/page.tsx');
const onboarding = source('apps/web/src/app/(app)/getting-started/page.tsx');
const creates = source('apps/api/src/creates/creates.service.ts');
const gates = source('apps/api/src/governance/gate-writes.service.ts');

const method = (file, start, next) => {
  const i = file.indexOf(start);
  assert.ok(i >= 0, `Expected ${start}`);
  const j = file.indexOf(next, i + start.length);
  assert.ok(j > i, `Expected next method ${next}`);
  return file.slice(i, j);
};

test('workspace billing reads and renewal writes require workspace admin, never vendor privileges', () => {
  for (const [name, file] of [['billing', billing], ['subscription', subscription]]) {
    assert.doesNotMatch(file, /requireCapability\('pmoa_platform'\)/, name);
    assert.match(file, /requireCapability\('pmoa_admin'\)/, name);
  }
  assert.match(stripe, /async createCheckout\(invoiceId: string\)\s*\{\s*requireCapability\('pmoa_admin'\)/);
});

test('the vendor-only Super Admin and module-entitlement boundary has NOT been relaxed', () => {
  assert.match(admin, /private async vendorId\(\): Promise<string>\s*\{\s*requireCapability\('pmoa_platform'\)/);
  assert.match(admin, /vendor\?\.isPlatformAdmin/);
  assert.match(platform, /requireCapability\('pmoa_platform'\)/);
  assert.doesNotMatch(admin, /requireCapability\('pmoa_admin'\)/);
});

test('billing navigation and page use customer admin capability', () => {
  assert.match(nav, /key: 'billing'[^\n]*cap: 'pmoa_admin'/);
  assert.match(nav, /key: 'super-admin'[^\n]*cap: 'pmoa_platform'/);
  assert.match(nav, /key: 'platform'[^\n]*cap: 'pmoa_platform'/);
  assert.match(page, /!session\.capabilities\.includes\('pmoa_admin'\)/);
  assert.match(onboarding, /session\.capabilities\.includes\('pmoa_admin'\)/);
});

test('tenant billing actions resolve tenant from authenticated context, not body/path', () => {
  for (const file of [subscription, billing]) {
    assert.match(file, /const \{ tenantId/);
    assert.match(file, /withTenant\(tenantId/);
    assert.doesNotMatch(file, /@Param\(['"]tenantId/);
  }
  assert.match(stripe, /WHERE i\.tenant_id = \$\{tenantId\} AND i\.id = \$\{invoiceId\}/);
});

test('repeated cancellation preference skips both update and event insertion', () => {
  const set = method(subscription, 'async setCancellation(', 'async history(');
  assert.match(set, /FOR UPDATE/);
  assert.match(set, /if \(current\.cancelAtPeriodEnd === cancel\)/);
  assert.match(set, /return \{ id: current\.id, cancelAtPeriodEnd: cancel, unchanged: true \}/);
  assert.ok(set.indexOf('unchanged: true') < set.indexOf('UPDATE tenant_subscriptions'));
  assert.ok(set.indexOf('unchanged: true') < set.indexOf('INSERT INTO subscription_events'));
});

test('membership changes remain locked and role/status writes require actual changes', () => {
  const set = method(creates, 'async updateMember(', 'async update(');
  assert.match(set, /FOR UPDATE/);
  assert.match(set, /mayChangeMembership/);
  assert.match(set, /roleChanged = b\.role !== undefined && b\.role !== m\.role/);
  assert.match(set, /statusChanged = b\.isActive !== undefined && b\.isActive !== m\.isActive/);
  assert.match(set, /if \(!roleChanged && !statusChanged\) return \{ ok: true, unchanged: true \}/);
  assert.match(set, /if \(roleChanged\)/);
  assert.match(set, /if \(statusChanged\)/);
  assert.doesNotMatch(set, /UPDATE users SET is_active/);
});

test('membership audit records before and after values, not the full raw request', () => {
  const set = method(creates, 'async updateMember(', 'async update(');
  assert.match(set, /await this\.audit\(tx, 'membership', userId, 'member\.changed', \{/);
  assert.match(set, /role: \{ before: m\.role, after: b\.role \}/);
  assert.match(set, /isActive: \{ before: m\.isActive, after: b\.isActive \}/);
  assert.doesNotMatch(set, /'member\.changed', b\)/);
});

test('gate readiness rejects inaccessible/nonexistent gate before assessing blockers', () => {
  const set = method(gates, 'async readiness(', 'async advance(');
  assert.match(set, /SELECT id FROM gates WHERE id = \$\{gateId\}/);
  assert.match(set, /if \(!gate\) throw new NotFoundException/);
  assert.ok(set.indexOf('if (!gate)') < set.indexOf('await gateBlockers'));
});

test('gate approval writes and audit events still share one tenant transaction', () => {
  const set = method(gates, 'async advance(', 'async updateRaid(');
  assert.match(set, /return withTenant\(tenantId, async \(tx\) => \{/);
  assert.match(set, /await this\.audit\(tx, 'gate', gateId, 'gate\.approved'/);
});

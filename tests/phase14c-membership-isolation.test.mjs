import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const text = p => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const auth = text('apps/api/src/auth/auth.service.ts');
const member = text('apps/api/src/creates/creates.service.ts');
const schema = text('packages/db/src/schema.ts');
const migration = text('packages/db/migrations/0017_tenant_membership_status.sql');
const contract = text('packages/contracts/src/creates.ts');
const tenant = text('apps/api/src/tenancy/tenant.middleware.ts');
const onboarding = text('apps/api/src/onboarding/onboarding.service.ts');
const notify = text('apps/api/src/notify/notify.service.ts');
const options = text('apps/api/src/modules/insights.service.ts');
test('migration preserves existing memberships as active and has an index', () => {
  assert.match(migration, /ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true/);
  assert.match(migration, /CREATE INDEX IF NOT EXISTS memberships_tenant_active_idx/);
});
test('Drizzle schema models tenant membership activity', () => {
  assert.match(schema, /isActive: boolean\('is_active'\)\.notNull\(\)\.default\(true\)/);
});
test('member suspension does not modify the global user state', () => {
  const change = member.split('async updateMember(')[1].split('async update(')[0];
  assert.doesNotMatch(change, /UPDATE users SET is_active/);
  assert.match(change, /UPDATE memberships SET is_active=\$\{b\.isActive\}/);
  assert.match(change, /WHERE tenant_id=\$\{tenantId\} AND user_id=\$\{userId\}/);
});
test('membership update locks tenant row before checking last active owner', () => {
  const change = member.split('async updateMember(')[1].split('async update(')[0];
  assert.match(change, /pg_advisory_xact_lock\(hashtextextended\(\$\{tenantId\}::text, 0\)\)/);
  assert.match(change, /mayChangeMembership\(/);
  assert.match(change, /otherActiveOwners/);
});
test('login tenant list only includes active workspace memberships', () => {
  assert.match(auth, /eq\(memberships\.userId, userId\), eq\(memberships\.isActive, true\)/);
});
test('existing sessions refuse disabled memberships immediately', () => {
  assert.match(auth, /eq\(memberships\.userId, u\.id\), eq\(memberships\.isActive, true\)/);
});
test('development header auth cannot bypass disabled memberships', () => {
  assert.match(tenant, /eq\(memberships\.isActive, true\)/);
});
test('assignment and creation choices exclude inactive memberships', () => {
  assert.match(member, /WHERE user_id = \$\{memberId\} AND is_active=true/);
  assert.match(member, /WHERE user_id = \$\{b\.userId\} AND is_active=true/);
  assert.match(options, /m\.is_active=true AND u\.is_active=true/);
});
test('scheduled notifications exclude deactivated workspace members', () => {
  assert.match(notify, /WHERE m\.is_active=true AND u\.is_active=true/);
});
test('onboarding progress counts only active members', () => {
  assert.match(onboarding, /FROM memberships m WHERE m\.tenant_id = \$\{tenantId\} AND m\.is_active=true/);
});
test('API member update accepts explicit JSON boolean rather than coercion', () => {
  assert.match(contract, /isActive: z\.boolean\(\)\.optional\(\)/);
  assert.doesNotMatch(contract, /isActive: z\.coerce\.boolean/);
});

test('browser creation proxy returns retryable status if API is unreachable', () => {
  const route = text('apps/web/src/app/api/create/route.ts');
  assert.match(route, /try \{\s*res = await fetch/);
  assert.match(route, /status: 503, headers: \{ 'Retry-After': '5' \}/);
  assert.match(route, /safeReturnPath\(back, '\/'\)/);
});
test('new record form localizes temporary failures and preserves entered values', () => {
  const form = text('apps/web/src/components/NewRecord.tsx');
  assert.match(form, /res.status === 503/);
  assert.match(form, /الخدمة غير متاحة مؤقتًا/);
  assert.match(form, /service is temporarily unavailable/);
});

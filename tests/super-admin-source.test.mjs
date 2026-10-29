// Dependency-free architecture tests. These do NOT replace HTTP/PostgreSQL integration tests.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = p => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const service = read('apps/api/src/platform/super-admin.service.ts');
const controller = read('apps/api/src/platform/super-admin.controller.ts');
const schema = read('apps/api/src/platform/super-admin.schemas.ts');
const routes = read('apps/web/src/app/api/super-admin/route.ts');
const migration = read('packages/db/migrations/0013_platform_subscription_audit.sql');
const privileges = read('packages/db/sql/rls.sql');
const page = read('apps/web/src/app/(app)/super-admin/page.tsx');
const module = read('apps/api/src/platform/platform.module.ts');
test('platform guard uses authenticated capability and a freshly verified vendor flag', () => {
  assert.match(service, /requireCapability\('pmoa_platform'\)/);
  assert.match(service, /users\.isPlatformAdmin/);
  assert.match(service, /if \(!vendor\?\.isPlatformAdmin\) throw new ForbiddenException/);
  assert.match(service, /if \(!userId\) throw new ForbiddenException/);
});
test('every admin operation calls vendor verification', () => {
  for (const name of ['plans','audit','createPlan','updatePlan','tenants','history','provision','cancel']) {
    const start = service.indexOf(`async ${name}(`);
    assert.ok(start > 0, name);
    const next = service.indexOf('\n  async ', start + 6);
    const text = service.slice(start, next === -1 ? undefined : next);
    assert.match(text, /await this\.vendorId\(\)/, name);
  }
});
test('tenant operations have a target tenant RLS transaction', () => {
  for (const name of ['history','provision','cancel']) {
    const start = service.indexOf(`async ${name}(`);
    const next = service.indexOf('\n  async ', start + 6);
    assert.match(service.slice(start, next === -1 ? undefined : next), /withTenant\(tenantId,/);
  }
});
test('write operations do not trust caller-supplied actor identity', () => {
  assert.doesNotMatch(schema, /actorUserId|userId|tenantId/);
  assert.match(service, /const actor = await this\.vendorId\(\)/);
});
test('manual grants are not treated as verified payments', () => {
  assert.match(service, /paymentVerified: false/);
  assert.match(service, /source: 'manual_grant'/);
  assert.match(schema, /reason: z\.string\(\)\.trim\(\)\.min\(10\)/);
});
test('cross-tenant subscription writes bind the validated path tenant id', () => {
  assert.match(service, /WHERE id = \$\{current\.id\} AND tenant_id = \$\{tenantId\}/);
  assert.match(service, /WHERE id = \$\{subscriptionId\} AND tenant_id = \$\{tenantId\}/);
  assert.match(service, /tenant_id, subscription_id, actor_user_id, event_type, details/);
});
test('grant and cancellation serialize on one tenant advisory lock', () => {
  assert.equal((service.match(/pg_advisory_xact_lock\(1212, hashtext\(\$\{tenantId\}\)\)/g) ?? []).length, 2);
});
test('plan creation and edits have a vendor-wide audit transaction', () => {
  assert.match(service, /'plan\.created'/);
  assert.match(service, /'plan\.updated'/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS platform_subscription_audit_events/);
  assert.match(privileges, /REVOKE UPDATE, DELETE ON platform_subscription_audit_events FROM pmo_app/);
});
test('controller validates UUID path arguments and Zod mutation bodies', () => {
  assert.equal((controller.match(/ParseUUIDPipe/g) ?? []).length >= 4, true);
  for (const form of ['planCreate','planUpdate','manualGrant','adminCancel'])
    assert.match(controller, new RegExp(`new ZodPipe\\(${form}\\)`));
});
test('browser proxy rejects unsafe origins and never offers arbitrary paths', () => {
  assert.match(routes, /rejectUnsafeBrowserMutation\(req\)/);
  assert.match(routes, /req\.cookies\.get\(SESSION\)/);
  assert.doesNotMatch(routes, /get\('url'\)|get\('path'\)/);
  assert.match(routes, /uuid\.test\(tenantId\)/);
});
test('the management page and protected routes are registered', () => {
  assert.match(page, /pmoa_platform/);
  assert.match(module, /SuperAdminController/);
  assert.match(module, /SuperAdminService/);
});

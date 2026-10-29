/** Source-wiring checks only; the actual HTTP/PostgreSQL checks run in CI. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const suite = readFileSync('tests/phase15-billing-isolation.test.ts', 'utf8');
const ci = readFileSync('.github/workflows/ci.yml', 'utf8');
test('live acceptance has a dedicated authenticated tenant isolation section', () => {
  assert.match(suite, /describe\.skipIf\(!liveAcceptance\)\('Phase 16E:/);
  assert.match(suite, /assertDisposableAcceptanceConfig\(process\.env\)/);
});
test('tenant fixture reuses existing reseed rather than destructive duplicate setup', () => {
  assert.equal((suite.match(/\breseed\(\)/g) || []).length, 1);
  assert.match(suite, /seededProjects = psql\(/);
});
test('proves project listing and direct detail isolation for both owners', () => {
  assert.match(suite, /assertTenantPage\(left\.body, tenantA, tenantB, projectA\)/);
  assert.match(suite, /assertTenantPage\(right\.body, tenantB, tenantA, projectB\)/);
  assert.match(suite, /assertDeniedForeignRecord\(foreignA/);
  assert.match(suite, /assertDeniedForeignRecord\(foreignB/);
});
test('rejects session cookie plus forged tenant/user headers', () => {
  assert.match(suite, /'x-tenant-id': tenantB/);
  assert.match(suite, /'x-user-id':/);
  assert.match(suite, /assertDeniedForeignRecord\(\{ status: response\.status \}, 'forged tenant header'\)/);
});
test('covers denied switch for owner and allowed switch for dual member', () => {
  assert.match(suite, /switchTo\(ownerA, tenantB\)/);
  assert.match(suite, /switchTo\(consultant, tenantA\)/);
  assert.match(suite, /switchTo\(consultant, tenantB\)/);
});
test('project and subscription fixture includes two independently populated tenants', () => {
  assert.match(suite, /expect\(projectA\)\.not\.toBe\(projectB\)/);
  assert.match(suite, /expect\(invoiceA\)\.not\.toBe\(invoiceB\)/);
});
test('CI requires the real suite after the API boots and database seeds', () => {
  const start = ci.indexOf('- name: Start API');
  const acceptance = ci.indexOf('- name: Live authenticated billing, project and workspace-switch isolation');
  const evidence = ci.indexOf('- name: Record billing API isolation evidence');
  assert.ok(start >= 0 && start < acceptance && acceptance < evidence);
  assert.match(ci, /pnpm exec vitest run tests\/phase15-billing-isolation\.test\.ts/);
});
test('CI opts into the test only for disposable test database', () => {
  assert.match(ci, /PHASE15_BILLING_ACCEPTANCE: 'true'/);
  assert.match(ci, /PHASE15_ACCEPT_DISPOSABLE_DB: 'YES_RESEED_DISPOSABLE_TEST_DATABASE'/);
});

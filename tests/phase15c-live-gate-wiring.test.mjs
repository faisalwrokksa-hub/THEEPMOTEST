import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const root = new URL('../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const ci = read('.github/workflows/ci.yml');
const suite = read('tests/phase15-billing-isolation.test.ts');
const script = read('scripts/phase15c-run-financial-rls.sh');

test('live suite checks disposable DB safety BEFORE destructive reseed', () => {
  const checked = suite.indexOf('assertDisposableAcceptanceConfig(process.env)');
  const reseeded = suite.indexOf('reseed();');
  assert.ok(checked >= 0 && reseeded > checked);
});
test('CI separately acknowledges destructive fixtures', () => {
  assert.match(ci, /PHASE15_ACCEPT_DISPOSABLE_DB: 'YES_RESEED_DISPOSABLE_TEST_DATABASE'/);
  assert.match(ci, /PHASE15_BILLING_ACCEPTANCE: 'true'/);
});
test('CI executes live RLS audit after authenticated billing acceptance and before general test run', () => {
  const api = ci.indexOf('- name: Start API');
  const billing = ci.indexOf('- name: Live authenticated billing, project and workspace-switch isolation');
  const rls = ci.indexOf('- name: Live financial PostgreSQL RLS tenant-visibility acceptance');
  const tests = ci.indexOf('- name: Tests');
  assert.ok(api >= 0 && billing > api && rls > billing && tests > rls);
  assert.match(ci, /run: bash scripts\/phase15c-run-financial-rls\.sh/);
});
test('live audit extracts IDs only from fixed test tenants', () => {
  assert.match(script, /get_tenant_id 'al-nakheel'/);
  assert.match(script, /get_tenant_id 'nexa'/);
  assert.match(script, /scripts\/stripe-db-rls-audit\.mjs/);
  assert.match(script, /set -euo pipefail/);
});
test('live audit uses the restricted app role from existing financial table verifier', () => {
  const audit = read('scripts/stripe-db-rls-audit.mjs');
  assert.match(audit, /dbRole === 'pmo_app'/);
  assert.match(audit, /SET TRANSACTION READ ONLY/);
  assert.match(audit, /verifyVisibleRows\(rows, requestedTenant, table\)/);
  assert.match(audit, /sampled\.unset/);
});
test('offline tests cannot reseed or run live financial gate implicitly', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.doesNotMatch(pkg.scripts['test:offline'], /phase15c-run-financial-rls\.sh/);
  assert.doesNotMatch(pkg.scripts['test:offline'], /phase15-billing-isolation\.test\.ts/);
});

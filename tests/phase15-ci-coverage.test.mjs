import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const root = new URL('../', import.meta.url);
const load = path => readFileSync(new URL(path, root), 'utf8');
const ci = load('.github/workflows/ci.yml');
const suite = load('tests/phase15-billing-isolation.test.ts');
const vitest = load('vitest.config.ts');

test('CI runs Phase 15 live acceptance after the API starts, not in offline checks', () => {
  const started = ci.indexOf('- name: Start API');
  const isolated = ci.indexOf('pnpm exec vitest run tests/phase15-billing-isolation.test.ts');
  assert.ok(started >= 0 && isolated > started, 'Integration test must run after the API health check');
  assert.match(ci, /- name: Apply production-equivalent SQL-ledger migrations/);
  assert.match(ci, /- name: Apply RLS policies/);
  assert.ok(ci.indexOf('Apply RLS policies') < isolated, 'Migrations and RLS must run before acceptance');
  assert.match(vitest, /fileParallelism:\s*false/);
  assert.match(ci, /PHASE15_BILLING_ACCEPTANCE: 'true'/);
  assert.match(suite, /describe\.skipIf\(!liveAcceptance\)/);
});

test('live suite requires two distinct tenants with seeded invoice records', () => {
  assert.match(suite, /expect\(entries\)\.toHaveLength\(2\)/);
  assert.match(suite, /expect\(invoiceA\)\.not\.toBe\(invoiceB\)/);
  assert.match(suite, /expect\(tenantA\)\.not\.toBe\(tenantB\)/);
  assert.match(suite, /INSERT INTO billing_invoices/);
  assert.match(suite, /INSERT INTO tenant_subscriptions/);
});

test('live suite exercises authenticated tenant boundaries and denies unauthorized billing writes', () => {
  for (const fragment of [
    "login('fatima@al-nakheel.test')", "login('khalid@nexa.test')",
    "login('pm@pmoalign.test')", "'/api/v1/subscription/billing/invoices'",
    "'/api/v1/subscription/current'", "'/api/v1/subscription/cancel-at-period-end'",
    "'/api/v1/subscription/resume'", "/api/v1/subscription/billing/renewal-invoice",
    "/api/v1/billing/stripe-webhook",
  ]) assert.ok(suite.includes(fragment), `Missing live check: ${fragment}`);
  assert.match(suite, /expect\(response\.status\)\.toBe\(403\)/);
  assert.match(suite, /expect\(row\.tenantId\)\.toBe\(tenantA\)/);
  assert.match(suite, /expect\(row\.tenantId\)\.toBe\(tenantB\)/);
});

test('offline test command includes the source gate but not live Vitest execution', () => {
  const pkg = JSON.parse(load('package.json'));
  assert.match(pkg.scripts['test:offline'], /tests\/\*\.test\.mjs/);
  assert.doesNotMatch(pkg.scripts['test:offline'], /phase15-billing-isolation\.test\.ts/);
});

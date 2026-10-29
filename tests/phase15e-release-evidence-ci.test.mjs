import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { CI_GATES, LAUNCH_GATES } from '../scripts/phase15e-release-evidence.mjs';
const ci = readFileSync(fileURLToPath(new URL('../.github/workflows/ci.yml', import.meta.url)), 'utf8');
const mark = gate => `node scripts/phase15e-release-evidence.mjs record ${gate}`;
const expectedBefore = new Map([
  ['packages_build', 'node scripts/verify-build-artifacts.mjs --scope packages'],
  ['migrations_rls', 'packages/db/sql/assert-financial-rls.sql'],
  ['db_restore', 'node scripts/verify-ci-database-restore.mjs'],
  ['types', 'pnpm typecheck'],
  ['tenant_isolation', 'pnpm check:data'],
  ['billing_api', 'pnpm exec vitest run tests/phase15-billing-isolation.test.ts'],
  ['financial_rls', 'bash scripts/phase15c-run-financial-rls.sh'],
  ['integration_tests', 'pnpm test'],
  ['recovery_api', 'pnpm exec vitest run tests/password-recovery.test.ts'],
  ['production_build', 'node scripts/verify-build-artifacts.mjs --scope all'],
  ['web_runtime', 'bash scripts/phase15d-run-web-smoke.sh'],
]);
test('CI runs every required live check before recording corresponding evidence', () => {
  let last = -1;
  for (const [gate, preceding] of expectedBefore) {
    const beforeAt = ci.indexOf(preceding);
    const receiptAt = ci.indexOf(mark(gate));
    assert.ok(beforeAt >= 0 && receiptAt > beforeAt, `${gate} must be recorded after its check`);
    assert.ok(receiptAt > last, `${gate} evidence sequence must be ordered`);
    assert.equal(ci.indexOf(mark(gate), receiptAt + 1), -1, `${gate} cannot be recorded more than once`);
    last = receiptAt;
  }
  assert.deepEqual(new Set(expectedBefore.keys()), new Set(CI_GATES));
});
test('CI fails closed when any evidence is missing and always publishes partial diagnostics', () => {
  assert.match(ci, /Enforce current-run CI acceptance evidence\n\s+if: always\(\)\n\s+run: node scripts\/phase15e-release-evidence\.mjs verify ci/);
  assert.match(ci, /Publish sanitized CI acceptance evidence\n\s+if: always\(\)/);
  assert.match(ci, /EPMO_EVIDENCE_DIR=\$RUNNER_TEMP\/epmo-evidence/);
  assert.match(ci, />> "\$GITHUB_ENV"/);
  assert.match(ci, /Initialize isolated CI evidence directory/);
});
test('CI cannot silently claim live Stripe, SES, or browser acceptance', () => {
  for (const gate of LAUNCH_GATES.filter(g => !CI_GATES.includes(g)))
    assert.doesNotMatch(ci, new RegExp(`record ${gate}`));
  assert.doesNotMatch(ci, /phase15e-release-evidence\.mjs verify launch/);
});
test('compiled web is built using production NODE_ENV', () => {
  assert.match(ci, /name: Production build\n\s+run: pnpm --filter @pmo\/web build\n\s+env:\n\s+NODE_ENV: production/);
});

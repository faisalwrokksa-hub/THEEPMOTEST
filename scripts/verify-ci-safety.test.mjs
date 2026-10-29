import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { checkCiSafety } from './verify-ci-safety.mjs';
const baseline = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');
test('current CI preserves every critical release safety guard', () => {
  const outcome = checkCiSafety(baseline);
  assert.deepEqual(outcome.checks.filter(x => !x.passed), []);
});
test('removing real tenant isolation fails safety guard', () => {
  assert.equal(checkCiSafety(baseline.replace('pnpm verify:rls', 'echo skipped')).passed, false);
});
test('removing current-run evidence verification fails safety guard', () => {
  assert.equal(checkCiSafety(baseline.replace('phase15e-release-evidence.mjs verify ci', 'echo bypass')).passed, false);
});
test('allowing repository write permissions fails safety guard', () => {
  assert.equal(checkCiSafety(baseline.replace('contents: read', 'contents: write')).passed, false);
});

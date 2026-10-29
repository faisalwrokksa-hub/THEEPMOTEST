import test from 'node:test';
import assert from 'node:assert/strict';
import { formatP0Summary } from './p0-ci-summary.mjs';
import { CI_GATES, LAUNCH_GATES } from './phase15e-release-evidence.mjs';
const result = (names, passed) => ({passed, checks: names.map(gate => ({gate, passed, reason: passed ? 'receipt verified' : 'receipt missing or malformed'}))});
test('no launch evidence is clearly NO-GO even with green CI', () => {
  const s = formatP0Summary(result(CI_GATES, true), result(LAUNCH_GATES, false));
  assert.match(s, /NO-GO/); assert.match(s, /CI checks: \*\*11\/11/);
});
test('all recorded evidence does not claim automatic authorization', () => {
  const s = formatP0Summary(result(CI_GATES, true), result(LAUNCH_GATES, true));
  assert.match(s, /independent review still required/);
  assert.doesNotMatch(s, /Commercial approval: \*\*GO/);
});

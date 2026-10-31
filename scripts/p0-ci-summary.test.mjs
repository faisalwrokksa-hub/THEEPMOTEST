import test from 'node:test';
import assert from 'node:assert/strict';
import { CI_GATES, LAUNCH_GATES } from './phase15e-release-evidence.mjs';
import { formatP0Summary } from './p0-ci-summary.mjs';

const ci = passed => ({ passed, checks: CI_GATES.map(gate => ({
  gate, passed, reason: passed ? 'receipt verified' : 'receipt missing',
})) });
const launch = passed => ({ passed, checks: LAUNCH_GATES.map(gate => ({
  gate, passed, reason: passed ? 'fabricated acceptance' : 'missing external acceptance',
})) });

test('green CI steps never become launch or nine-gate commercial approval', () => {
  const summary = formatP0Summary(ci(true), launch(false));
  assert.match(summary, /Same-run CI step receipts: \*\*11\/11\*\*/);
  assert.match(summary, /Independent live acceptance: \*\*0\/6 verified by CI\*\*/);
  assert.match(summary, /Nine commercial release gates: \*\*NOT ASSESSED by CI\*\*/);
  assert.match(summary, /Commercial approval: \*\*NO-GO/);
  assert.doesNotMatch(summary, /11\/17|EVIDENCE COMPLETE/);
});

test('even a forged launch.passed flag and six fabricated live receipts cannot promote CI', () => {
  const summary = formatP0Summary(ci(true), launch(true));
  assert.match(summary, /Independent live acceptance: \*\*0\/6 verified by CI\*\*/);
  assert.match(summary, /stripe_test_payment \| NOT VERIFIED/);
  assert.match(summary, /staging_deployment_live \| NOT VERIFIED/);
  assert.match(summary, /disaster_recovery_live \| NOT VERIFIED/);
  assert.match(summary, /Commercial approval: \*\*NO-GO/);
  assert.doesNotMatch(summary, /EVIDENCE COMPLETE|PASS \(same-run receipt\)/);
});

test('missing, duplicated or failed CI receipts cannot inflate the CI count', () => {
  const empty = formatP0Summary({ checks: [] }, launch(false));
  assert.match(empty, /Same-run CI step receipts: \*\*0\/11\*\*/);
  const duplicates = { checks: [...ci(true).checks, ci(true).checks[0]] };
  const summary = formatP0Summary(duplicates, launch(false));
  assert.match(summary, /Same-run CI step receipts: \*\*10\/11\*\*/);
  assert.match(summary, /packages_build \| BLOCKED \(receipt missing or ambiguous\)/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { REQUIRED_GATES, REQUIRED_STRIPE_SCENARIOS } from '../scripts/commercial-release-gate.mjs';
const manifest = JSON.parse(readFileSync(new URL('../docs/commercial-release-evidence.json', import.meta.url), 'utf8'));
test('release evidence stays NO-GO until actual externally verified receipts exist', () => {
  assert.equal(manifest.decision, 'NO-GO');
  assert.equal(manifest.candidateSha, null);
  for (const key of REQUIRED_GATES) assert.ok(Object.hasOwn(manifest.gates,key), 'missing '+key);
  for (const key of REQUIRED_STRIPE_SCENARIOS) assert.ok(Object.hasOwn(manifest.gates.stripe_test_billing.scenarios,key), 'missing Stripe '+key);
});

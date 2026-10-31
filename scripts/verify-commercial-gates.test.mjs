import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { evaluateCommercialManifest, REQUIRED_GATES, STRIPE_SCENARIOS } from './verify-commercial-gates.mjs';

const NOW = new Date('2026-10-31T10:00:00.000Z');
const SHA = 'a'.repeat(40);
const receipt = () => ({
  status: 'PASS', commitSha: SHA,
  artifactUrl: 'https://github.com/example/repo/actions/runs/123',
  executedAtUtc: '2026-10-31T09:00:00.000Z',
  reviewer: 'Independent QA', testResult: 'PASS',
});
function acceptedManifest() {
  const gates = Object.fromEntries(REQUIRED_GATES.map(g => [g, receipt()]));
  gates.stripe_test_billing.mode = 'test';
  gates.stripe_test_billing.scenarios = Object.fromEntries(STRIPE_SCENARIOS.map(s => [s, receipt()]));
  return { schemaVersion: 1, candidateSha: SHA, decision: 'NO-GO', gates };
}
test('Q31: repository evidence cannot claim commercial launch from CI-only progress', () => {
  const source = JSON.parse(readFileSync(new URL('../docs/commercial-release-evidence.json', import.meta.url), 'utf8'));
  const result = evaluateCommercialManifest(source, NOW);
  assert.equal(result.decision, 'NO-GO');
  assert.equal(result.accepted, 0);
  assert.equal(result.total, 9);
  assert.equal(result.evidenceReady, false);
});
test('Q31: complete receipt metadata is still NOT a launch approval', () => {
  const result = evaluateCommercialManifest(acceptedManifest(), NOW);
  assert.equal(result.accepted, 9);
  assert.equal(result.evidenceReady, true);
  assert.equal(result.decision, 'NO-GO');
});
test('Q31: stale SHA, missing scenario, absent reviewer or untrusted URL block acceptance', () => {
  const mutations = [
    m => { m.gates.tenant_rls.commitSha = 'b'.repeat(40); },
    m => { delete m.gates.stripe_test_billing.scenarios.webhook_replay_idempotent; },
    m => { m.gates.support_legal.reviewer = ''; },
    m => { m.gates.staging_smoke.artifactUrl = 'http://localhost/receipt'; },
    m => { m.gates.ci_build_tests.executedAtUtc = '2099-01-01T00:00:00Z'; },
    m => { m.candidateSha = null; },
  ];
  for (const mutate of mutations) {
    const manifest = acceptedManifest(); mutate(manifest);
    assert.equal(evaluateCommercialManifest(manifest, NOW).evidenceReady, false);
  }
});
test('Q31: unsupported GO assertion is flagged rather than accepted', () => {
  const m = acceptedManifest(); m.decision = 'GO';
  delete m.gates.stripe_test_billing.scenarios.entitlement_activation;
  assert.equal(evaluateCommercialManifest(m, NOW).manifestDecisionConsistent, false);
});

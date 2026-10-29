import { test } from 'node:test';
import assert from 'node:assert/strict';
import { REQUIRED_GATES, REQUIRED_STRIPE_SCENARIOS, evaluateCommercialEvidence } from './commercial-release-gate.mjs';

const sha = 'a'.repeat(40);
const gate = {
  status: 'PASS',
  commitSha: sha,
  artifactUrl: 'https://github.com/faisalwrokksa-hub/THEEPMOTEST/actions/runs/123',
  executedAtUtc: new Date().toISOString(),
  environment: 'staging',
  reviewer: 'release-reviewer',
  testResult: 'passed',
};
const valid = () => ({
  schemaVersion: 1,
  decision: 'NO-GO',
  candidateSha: sha,
  gates: Object.fromEntries(REQUIRED_GATES.map(id => [id, {
    ...gate, ...(id === 'stripe_test_billing' ? { mode: 'test', scenarios: Object.fromEntries(REQUIRED_STRIPE_SCENARIOS.map(scenario => [scenario, { ...gate, status: 'PASS' }])) } : {}),
  }])),
});

test('rejects incomplete manifest with NO-GO', () => {
  const result = evaluateCommercialEvidence({ schemaVersion: 1, decision: 'NO-GO', candidateSha: sha, gates: {} });
  assert.equal(result.readyForHumanReview, false);
  assert.equal(result.issues.length, REQUIRED_GATES.length);
});

test('complete manifest only becomes review-ready, not approved', () => {
  const result = evaluateCommercialEvidence(valid());
  assert.deepEqual(result, { readyForHumanReview: true, issues: [] });
});

test('rejects mixed-commit evidence', () => {
  const manifest = valid();
  manifest.gates.tenant_rls.commitSha = 'b'.repeat(40);
  assert.match(evaluateCommercialEvidence(manifest).issues.join('\n'), /tenant_rls: not verified on candidate SHA/);
});

test('rejects Stripe live mode and missing test-mode marker', () => {
  const manifest = valid();
  manifest.gates.stripe_test_billing.mode = 'live';
  assert.match(evaluateCommercialEvidence(manifest).issues.join('\n'), /Stripe TEST mode not evidenced/);
});

test('rejects missing audit URLs, timestamps and reviewers', () => {
  const manifest = valid();
  manifest.gates.staging_smoke.artifactUrl = 'http://example.com/run';
  manifest.gates.staging_smoke.executedAtUtc = 'not-a-time';
  manifest.gates.staging_smoke.reviewer = '';
  const result = evaluateCommercialEvidence(manifest);
  assert.equal(result.readyForHumanReview, false);
  assert.equal(result.issues.filter(x => x.startsWith('staging_smoke:')).length, 3);
});

test('does not permit secrets inside evidence records', () => {
  const manifest = valid();
  manifest.notes = ['sk', 'test', 'fake12345678901234567890'].join('_');
  const result = evaluateCommercialEvidence(manifest);
  assert.equal(result.readyForHumanReview, false);
  assert.match(result.issues[0], /Secret-like content/);
});

test('rejects missing candidate SHA even with individually passed gates', () => {
  const manifest = valid();
  manifest.candidateSha = null;
  assert.equal(evaluateCommercialEvidence(manifest).readyForHumanReview, false);
});


test('rejects Stripe blanket PASS without individual lifecycle proofs', () => {
  const manifest = valid();
  delete manifest.gates.stripe_test_billing.scenarios;
  assert.match(evaluateCommercialEvidence(manifest).issues.join('\\n'), /missing detailed Stripe lifecycle scenarios/);
});

test('rejects incomplete first-customer, webhook and cancellation evidence', () => {
  const manifest = valid();
  delete manifest.gates.stripe_test_billing.scenarios.first_customer_subscription_checkout;
  manifest.gates.stripe_test_billing.scenarios.webhook_replay_idempotent.status = 'PENDING';
  manifest.gates.stripe_test_billing.scenarios.subscription_cancellation.commitSha = 'b'.repeat(40);
  const issues = evaluateCommercialEvidence(manifest).issues.join('\\n');
  assert.match(issues, /first_customer_subscription_checkout: not passed/);
  assert.match(issues, /webhook_replay_idempotent: not passed/);
  assert.match(issues, /subscription_cancellation: candidate SHA mismatch/);
});

test('rejects future-dated evidence and self-authorized GO', () => {
  const manifest = valid();
  manifest.decision = 'GO';
  manifest.gates.stripe_test_billing.scenarios.entitlement_activation.executedAtUtc = '2099-01-01T00:00:00Z';
  manifest.gates.ci_build_tests.executedAtUtc = '2099-01-01T00:00:00Z';
  const issues = evaluateCommercialEvidence(manifest).issues.join('\\n');
  assert.match(issues, /cannot self-authorize/);
  assert.match(issues, /entitlement_activation: invalid execution timestamp/);
  assert.match(issues, /ci_build_tests: execution timestamp is in the future/);
});

test('rejects unsupported schema version', () => {
  const manifest = valid();
  manifest.schemaVersion = 99;
  assert.match(evaluateCommercialEvidence(manifest).issues.join('\\n'), /Unsupported evidence schema version/);
});

test('rejects stale release evidence even if a gate claims PASS', () => {
  const manifest = valid();
  const stale = new Date(Date.now() - 96 * 60 * 60 * 1000).toISOString();
  manifest.gates.ci_build_tests.executedAtUtc = stale;
  manifest.gates.stripe_test_billing.scenarios.webhook_signature_verified.executedAtUtc = stale;
  const issues = evaluateCommercialEvidence(manifest).issues.join('\n');
  assert.match(issues, /ci_build_tests: evidence older than 72 hours/);
  assert.match(issues, /webhook_signature_verified: evidence older than 72 hours/);
});

test('rejects calendar-invalid timestamps rather than normalizing them', () => {
  const manifest = valid();
  manifest.gates.staging_smoke.executedAtUtc = '2026-02-30T12:00:00Z';
  assert.match(evaluateCommercialEvidence(manifest).issues.join('\n'), /staging_smoke: invalid UTC execution timestamp/);
});

test('rejects artifact URLs containing embedded credentials, fragments or sensitive query keys', () => {
  const manifest = valid();
  manifest.gates.ci_build_tests.artifactUrl = 'https://username:password@github.com/example/actions/runs/1';
  manifest.gates.stripe_test_billing.scenarios.entitlement_activation.artifactUrl = 'https://github.com/example/actions/runs/1?token=abc';
  manifest.gates.staging_smoke.artifactUrl = 'https://github.com/example/actions/runs/1#private';
  const issues = evaluateCommercialEvidence(manifest).issues.join('\n');
  assert.match(issues, /ci_build_tests: missing safe HTTPS evidence artifact URL/);
  assert.match(issues, /entitlement_activation: missing safe HTTPS artifact URL/);
  assert.match(issues, /staging_smoke: missing safe HTTPS evidence artifact URL/);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { REQUIRED_GATES, evaluateCommercialEvidence } from './commercial-release-gate.mjs';

const sha = 'a'.repeat(40);
const gate = {
  status: 'PASS',
  commitSha: sha,
  artifactUrl: 'https://github.com/faisalwrokksa-hub/THEEPMOTEST/actions/runs/123',
  executedAtUtc: '2026-10-29T18:00:00Z',
  environment: 'staging',
  reviewer: 'release-reviewer',
  testResult: 'passed',
};
const valid = () => ({
  candidateSha: sha,
  gates: Object.fromEntries(REQUIRED_GATES.map(id => [id, {
    ...gate, ...(id === 'stripe_test_billing' ? { mode: 'test' } : {}),
  }])),
});

test('rejects incomplete manifest with NO-GO', () => {
  const result = evaluateCommercialEvidence({ candidateSha: sha, gates: {} });
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

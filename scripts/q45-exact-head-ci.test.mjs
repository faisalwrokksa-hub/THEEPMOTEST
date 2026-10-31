import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assertCandidateSha, candidateShaFromEnvironment } from './assert-ci-candidate-sha.mjs';
import { checkCiSafety } from './verify-ci-safety.mjs';

const workflow = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');
const a = 'a'.repeat(40);
const b = 'b'.repeat(40);
test('Q45: four jobs pin and attest the immutable PR head', () => {
  assert.equal(checkCiSafety(workflow).passed, true);
  assert.equal(workflow.split('uses: actions/checkout@v4').length - 1, 4);
  assert.equal(workflow.split('run: node scripts/assert-ci-candidate-sha.mjs').length - 1, 4);
});
test('Q45: deleting a checkout ref or an attestation fails CI static policy', () => {
  const missingPin = workflow.replace(/          ref: .*pull_request.head.sha.*\n/, '');
  assert.equal(checkCiSafety(missingPin).passed, false);
  const missingCheck = workflow.replace('        run: node scripts/assert-ci-candidate-sha.mjs', '');
  assert.equal(checkCiSafety(missingCheck).passed, false);
});
test('Q45: PR synthetic merge SHA cannot masquerade as tested head', () => {
  assert.equal(assertCandidateSha(a, a.toUpperCase()), a);
  assert.throws(() => assertCandidateSha(a, b), /differs/);
  assert.throws(() => assertCandidateSha('not-a-sha', a), /Invalid/);
});
test('Q45: receipt identity requires candidate env, never implicit GITHUB_SHA', () => {
  assert.equal(candidateShaFromEnvironment({ EPMO_CANDIDATE_SHA: a, GITHUB_SHA: b }), a);
  assert.throws(() => candidateShaFromEnvironment({ GITHUB_SHA: b }), /Missing/);
  for (const path of ['phase15e-release-evidence.mjs', 'p0-ci-summary.mjs']) {
    const source = readFileSync(new URL(path, import.meta.url), 'utf8');
    assert.ok(source.includes('process.env.EPMO_CANDIDATE_SHA'));
    assert.ok(!source.includes('process.env.GITHUB_SHA'));
  }
});

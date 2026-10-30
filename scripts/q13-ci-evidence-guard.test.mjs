import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateCiEvidence, REQUIRED_JOBS, REQUIRED_VERIFY_STEPS } from './q13-ci-evidence-guard.mjs';
const SHA = '0e03471d5d3bb4c1e8ad355ed8b95544d4c662f2';
function fixture() {
  const run = { id: 123, head_sha: SHA, status: 'completed', conclusion: 'success' };
  const steps = name => {
    const required = name === 'verify' ? REQUIRED_VERIFY_STEPS :
      name === 'audit' ? ['Run pnpm install --frozen-lockfile', 'Run pnpm audit --audit-level high'] :
      name === 'Dependency-free source checks' ? ['Run npm run test:offline'] : ['Candidate check'];
    return required.map((n, i) => ({ name: n, number: i + 1, conclusion: 'success' }));
  };
  const jobs = { total_count: 4, jobs: REQUIRED_JOBS.map(name => ({
    name, run_id: 123, status: 'completed', conclusion: 'success', steps: steps(name),
  })) };
  return { run, jobs };
}
test('accepts complete same-SHA CI evidence but does not imply launch approval', () => {
  const { run, jobs } = fixture();
  assert.deepEqual(evaluateCiEvidence(run, jobs, SHA), { passed: true, issues: [] });
});
test('rejects success reported for another SHA', () => {
  const { run, jobs } = fixture();
  run.head_sha = 'a'.repeat(40);
  assert.equal(evaluateCiEvidence(run, jobs, SHA).passed, false);
});
test('rejects queued, failed, skipped or incomplete jobs and steps', () => {
  for (const kind of ['queued', 'failure', 'skipped', 'missing']) {
    const { run, jobs } = fixture();
    if (kind === 'queued') run.status = 'queued';
    if (kind === 'failure') jobs.jobs[1].conclusion = 'failure';
    if (kind === 'skipped') jobs.jobs[3].steps[0].conclusion = 'skipped';
    if (kind === 'missing') jobs.jobs[3].steps.shift();
    assert.equal(evaluateCiEvidence(run, jobs, SHA).passed, false, kind);
  }
});
test('rejects partial pagination, wrong-run jobs and missing required jobs', () => {
  const { run, jobs } = fixture();
  jobs.total_count = 5;
  assert.equal(evaluateCiEvidence(run, jobs, SHA).passed, false);
  jobs.total_count = 4;
  jobs.jobs[0].run_id = 456;
  assert.equal(evaluateCiEvidence(run, jobs, SHA).passed, false);
  jobs.jobs.shift();
  assert.equal(evaluateCiEvidence(run, jobs, SHA).passed, false);
});

test('rejects absent workflow ID, absent job provenance, and missing pagination totals', () => {
  const { run, jobs } = fixture();
  delete run.id;
  assert.equal(evaluateCiEvidence(run, jobs, SHA).passed, false, 'missing run id');
  run.id = 123;
  delete jobs.jobs[0].run_id;
  assert.equal(evaluateCiEvidence(run, jobs, SHA).passed, false, 'missing job run id');
  jobs.jobs[0].run_id = 123;
  delete jobs.total_count;
  assert.equal(evaluateCiEvidence(run, jobs, SHA).passed, false, 'missing total_count');
  jobs.total_count = 3;
  assert.equal(evaluateCiEvidence(run, jobs, SHA).passed, false, 'inconsistent total_count');
});

test('rejects malformed jobs and steps rather than throwing or accepting them', () => {
  const { run, jobs } = fixture();
  jobs.jobs.push(null);
  jobs.total_count = jobs.jobs.length;
  assert.equal(evaluateCiEvidence(run, jobs, SHA).passed, false, 'null job');
  jobs.jobs.pop();
  jobs.total_count = jobs.jobs.length;
  jobs.jobs[3].steps.push(null);
  assert.equal(evaluateCiEvidence(run, jobs, SHA).passed, false, 'null step');
});

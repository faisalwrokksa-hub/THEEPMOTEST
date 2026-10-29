import test from 'node:test';
import assert from 'node:assert/strict';
import { computeOnboardingProgress } from './onboarding-progress.ts';

test('new workspace is 1 of 5 steps completed', () => {
  const out = computeOnboardingProgress({ members: 1, portfolios: 0, programs: 0, projects: 0 });
  assert.equal(out.completed, 1);
  assert.equal(out.percent, 20);
  assert.deepEqual(out.tasks.map(t => t.completed), [true, false, false, false, false]);
});
test('fully configured workspace is 100 percent', () => {
  const out = computeOnboardingProgress({ members: 3, portfolios: 2, programs: 1, projects: 4 });
  assert.equal(out.completed, 5);
  assert.equal(out.percent, 100);
});
test('member count includes administrator, so team requires two members', () => {
  assert.equal(computeOnboardingProgress({ members: 1 }).tasks[1].completed, false);
  assert.equal(computeOnboardingProgress({ members: 2 }).tasks[1].completed, true);
});
test('a first project does not fabricate an existing portfolio or programme', () => {
  const out = computeOnboardingProgress({ members: 1, portfolios: 0, programs: 0, projects: 1 });
  assert.equal(out.completed, 2);
  assert.deepEqual(out.tasks.filter(t => t.completed).map(t => t.key), ['workspace', 'project']);
});
test('PostgreSQL text-form counts are normalized', () => {
  assert.equal(computeOnboardingProgress({ members: '2', portfolios: '1', programs: '1', projects: '1' }).completed, 5);
});
test('unexpected values cannot mark a task completed', () => {
  const out = computeOnboardingProgress({ members: 'NaN', portfolios: -1, programs: Infinity, projects: '1e900' });
  assert.equal(out.completed, 1);
  assert.deepEqual(out.counts, { members: 0, portfolios: 0, programs: 0, projects: 0 });
});
test('all actions target safe internal routes and scoped capabilities', () => {
  const tasks = computeOnboardingProgress({}).tasks;
  assert.deepEqual(tasks.map(t => t.href), ['/settings','/settings','/portfolios','/portfolios','/projects']);
  assert.deepEqual(tasks.map(t => t.capability), ['read', 'pmoa_manage_people', 'pmoa_manage_projects','pmoa_manage_projects','pmoa_manage_projects']);
});

test('guided setup recommends a portfolio before a programme or project', () => {
  assert.equal(computeOnboardingProgress({ members: 1 }).nextStep, 'portfolio');
  assert.equal(computeOnboardingProgress({ members: 1, portfolios: 1 }).nextStep, 'program');
  assert.equal(computeOnboardingProgress({ members: 1, portfolios: 1, programs: 1 }).nextStep, 'project');
});
test('team invitation is recommended only after project structure exists', () => {
  assert.equal(computeOnboardingProgress({ members: 1, portfolios: 1, programs: 1, projects: 1 }).nextStep, 'team');
  assert.equal(computeOnboardingProgress({ members: 2, portfolios: 1, programs: 1, projects: 1 }).nextStep, null);
});
test('an existing project does not skip a missing portfolio or programme', () => {
  assert.equal(computeOnboardingProgress({ members: 2, projects: 1 }).nextStep, 'portfolio');
});

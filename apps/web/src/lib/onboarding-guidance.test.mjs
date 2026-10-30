import test from 'node:test';
import assert from 'node:assert/strict';
import { onboardingActionHref, onboardingActionLicensed } from './onboarding-guidance.ts';

test('actions use only internal, known destinations', () => {
  assert.deepEqual(['workspace','team','portfolio','program','project'].map(onboardingActionHref), [
    '/settings','/settings','/portfolios?new=portfolio','/programs?new=program','/projects?new=project',
  ]);
});
test('unlicensed workspaces cannot follow commercial create actions', () => {
  for (const key of ['portfolio','program','project']) {
    assert.equal(onboardingActionLicensed(key,['core360']), false);
    assert.equal(onboardingActionLicensed(key,['core360','pmo360']), true);
  }
});
test('workspace and team remain accessible without paid PMO module', () => {
  assert.equal(onboardingActionLicensed('workspace', []), true);
  assert.equal(onboardingActionLicensed('team', []), true);
});

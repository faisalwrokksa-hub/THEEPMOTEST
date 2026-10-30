import test from 'node:test';
import assert from 'node:assert/strict';
import { computeOnboardingProgress } from './onboarding-progress.ts';
test('onboarding accepts PostgreSQL decimal counts, not arbitrary numeric encodings', () => {
  const valid = computeOnboardingProgress({ members: '2', portfolios: '1', programs: '1', projects: '1' });
  assert.equal(valid.completed, 5);
  for (const invalid of ['0x10', '1e2', 'Infinity', '', '  ', '-1', '1.5']) {
    const status = computeOnboardingProgress({ members: invalid });
    assert.equal(status.counts.members, 0, invalid);
    assert.equal(status.tasks.find(t => t.key === 'team').completed, false, invalid);
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const root = new URL('../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');

test('onboarding next action checks both permission and paid module access', () => {
  const source = read('apps/web/src/app/(app)/getting-started/page.tsx');
  assert.match(source, /can\(capabilities, nextTask\.capability\)/);
  assert.match(source, /onboardingActionLicensed\(nextTask\.key, modules\)/);
});
test('create forms open only for exact deep-link query values', () => {
  const port = read('apps/web/src/app/(app)/portfolios/page.tsx');
  const proj = read('apps/web/src/app/(app)/projects/page.tsx');
  assert.match(port, /openForm === 'portfolio'/);
  assert.match(port, /openForm === 'program'/);
  assert.match(proj, /openForm === 'project'/);
});
test('creation UI respects permission and license in portfolio and project screens', () => {
  for (const file of ['apps/web/src/app/(app)/portfolios/page.tsx','apps/web/src/app/(app)/projects/page.tsx']) {
    const source = read(file);
    assert.match(source, /can\(capabilities, 'pmoa_manage_projects'\)/);
    assert.match(source, /licensedModules\.includes\('pmo360'\)/);
    assert.match(source, /\{mayCreate \?/);
  }
});
test('guided create links cannot be supplied as unchecked external destinations', () => {
  const guide = read('apps/web/src/lib/onboarding-guidance.ts');
  assert.match(guide, /switch \(key\)/);
  assert.doesNotMatch(guide, /window\.|location\.|decodeURIComponent\(/);
});

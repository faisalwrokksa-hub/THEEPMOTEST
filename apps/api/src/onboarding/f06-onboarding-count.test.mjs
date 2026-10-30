import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('./onboarding-progress.ts', import.meta.url), 'utf8');
test('onboarding count parser does not coerce empty database values into zero', () => {
  assert.match(source, /value\.trim\(\) !== ''/);
  assert.match(source, /Number\.isSafeInteger\(n\) && n >= 0/);
});

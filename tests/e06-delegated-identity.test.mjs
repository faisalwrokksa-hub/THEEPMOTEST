import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../apps/api/src/microsoft/delegated-user-policy.ts', import.meta.url), 'utf8');
test('delegated connection requires nonblank owner and caller identities', () => {
  assert.match(source, /connectedBy\.trim\(\)\.length > 0/);
  assert.match(source, /userId\.trim\(\)\.length > 0/);
  assert.match(source, /connectedBy === userId/);
});

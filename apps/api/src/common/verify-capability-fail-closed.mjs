import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('./require-capability.ts', import.meta.url), 'utf8');
test('empty request capability list is not replaced with role privileges', () => {
  assert.match(source, /const held = capabilities \?\? \[\]/);
  assert.doesNotMatch(source, /capabilities\?\.length\s*\?/);
});
test('authorization uses can against authenticated capability set', () => {
  assert.match(source, /can\(held, needed\)/);
});

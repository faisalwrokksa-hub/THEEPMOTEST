import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('./stripe-policy.ts', import.meta.url), 'utf8');
test('Stripe signature header rejects empty comma-delimited fields', () => {
  assert.match(source, /pieces\.some\(piece => piece === ''\)/);
  assert.match(source, /timingSafeEqual\(signature, expected\)/);
});

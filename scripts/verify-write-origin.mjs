// Run with: node --experimental-strip-types scripts/verify-write-origin.mjs
import assert from 'node:assert/strict';
import { isAllowedWriteRequest } from '../apps/api/src/common/write-origin.guard.ts';
const allowed = ['https://epmo.example', 'https://www.epmo.example'];
const cases = [
  ['GET', 'https://attacker.example', 'cross-site', true],
  ['POST', 'https://epmo.example', 'same-site', true],
  ['PATCH', 'https://www.epmo.example', 'same-origin', true],
  ['POST', 'https://attacker.example', 'cross-site', false],
  ['DELETE', undefined, 'cross-site', false],
  ['POST', 'null', 'none', false],
  ['POST', 'https://attacker.example', undefined, false],
  ['POST', undefined, undefined, true],
];
for (const [method, origin, site, expected] of cases) {
  assert.equal(isAllowedWriteRequest(method, origin, site, allowed), expected,
    `${method} origin=${origin} fetchSite=${site}`);
}
console.log(`${cases.length}/${cases.length} write-origin tests passed`);

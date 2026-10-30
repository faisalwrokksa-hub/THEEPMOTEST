import test from 'node:test';
import assert from 'node:assert/strict';
import { canUseDelegatedMicrosoftConnection as allowed } from '../apps/api/src/microsoft/delegated-user-policy.ts';
test('only the exact consenting identity can use the delegated connection', () => {
  assert.equal(allowed('owner-a', 'owner-a'), true);
  for (const user of ['owner-b', 'owner-a ', ' owner-a', '', '   ', null, undefined])
    assert.equal(allowed('owner-a', user), false);
});
test('legacy, blank and unowned connections fail closed', () => {
  for (const owner of ['', '  ', null, undefined]) assert.equal(allowed(owner, 'owner-a'), false);
});

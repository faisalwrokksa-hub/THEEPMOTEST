import assert from 'node:assert/strict';
import test from 'node:test';
import { isCreateSuccess } from './create-response.mjs';

test('accepts an explicit successful create acknowledgement', () => {
  assert.equal(isCreateSuccess(200, { ok: true, redirect: '/projects?done=project' }), true);
});

test('rejects HTTP 200 HTML or unparsable proxy responses', () => {
  assert.equal(isCreateSuccess(200, {}), false);
  assert.equal(isCreateSuccess(200, null), false);
  assert.equal(isCreateSuccess(200, '<html>error</html>'), false);
});

test('rejects HTTP errors even with an apparent success body', () => {
  assert.equal(isCreateSuccess(401, { ok: true, redirect: '/login' }), false);
  assert.equal(isCreateSuccess(503, { ok: true, redirect: '/projects' }), false);
});

test('rejects malformed acknowledgements without a destination', () => {
  assert.equal(isCreateSuccess(200, { ok: true }), false);
  assert.equal(isCreateSuccess(200, { ok: true, redirect: '  ' }), false);
  assert.equal(isCreateSuccess(200, { ok: 'true', redirect: '/projects' }), false);
});

test('rejects non-2xx statuses and fractional status values', () => {
  assert.equal(isCreateSuccess(302, { ok: true, redirect: '/projects' }), false);
  assert.equal(isCreateSuccess(200.5, { ok: true, redirect: '/projects' }), false);
});

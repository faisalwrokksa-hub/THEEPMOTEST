import assert from 'node:assert/strict';
import test from 'node:test';
import { focusWrapTarget } from './focus-trap.mjs';

const first = { id: 'close' };
const middle = { id: 'projects' };
const last = { id: 'reports' };
const elements = [first, middle, last];

test('Tab from the last element wraps to the first', () => {
  assert.equal(focusWrapTarget(last, elements, false), first);
});

test('Shift+Tab from the first element wraps to the last', () => {
  assert.equal(focusWrapTarget(first, elements, true), last);
});

test('Tab within the dialog is handled by the browser', () => {
  assert.equal(focusWrapTarget(middle, elements, false), null);
  assert.equal(focusWrapTarget(middle, elements, true), null);
});

test('Focus outside the dialog is recovered in either direction', () => {
  assert.equal(focusWrapTarget(null, elements, false), first);
  assert.equal(focusWrapTarget({ id: 'outside' }, elements, true), last);
});

test('Empty dialogs do not throw or invent focus targets', () => {
  assert.equal(focusWrapTarget(null, [], false), null);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { mayChangeMembership, removesActiveOwner } from './membership-policy.ts';
const evaluate = (input = {}) => mayChangeMembership(
  input.actor ?? 'admin', input.target ?? 'member', input.currentRole ?? 'viewer',
  input.active ?? true, input.nextRole, input.nextActive, input.otherOwners ?? 0,
);
test('a workspace admin may deactivate an ordinary member', () => {
  assert.deepEqual(evaluate({ nextActive: false }), { ok: true });
});
test('a workspace admin may reactivate a suspended member', () => {
  assert.deepEqual(evaluate({ active: false, nextActive: true }), { ok: true });
});
test('a member cannot deactivate themselves', () => {
  assert.deepEqual(evaluate({ actor: 'member', nextActive: false }), { ok: false, reason: 'self_lockout' });
});
test('a member cannot change their own role', () => {
  assert.deepEqual(evaluate({ actor: 'member', nextRole: 'viewer' }), { ok: false, reason: 'self_lockout' });
});
test('own reactivation without a role change is allowed', () => {
  assert.deepEqual(evaluate({ actor: 'member', active: false, nextActive: true }), { ok: true });
});
test('last active workspace owner cannot be deactivated', () => {
  assert.deepEqual(evaluate({ currentRole: 'owner', nextActive: false }), { ok: false, reason: 'last_owner' });
});
test('last active workspace owner cannot be demoted', () => {
  assert.deepEqual(evaluate({ currentRole: 'owner', nextRole: 'admin' }), { ok: false, reason: 'last_owner' });
});
test('an owner can be deactivated when another active owner exists', () => {
  assert.deepEqual(evaluate({ currentRole: 'owner', nextActive: false, otherOwners: 1 }), { ok: true });
});
test('an owner can keep their role and stay active without another owner', () => {
  assert.deepEqual(evaluate({ currentRole: 'owner', nextRole: 'owner', nextActive: true }), { ok: true });
});
test('inactive historical owners are not treated as active when being edited', () => {
  assert.equal(removesActiveOwner('owner', false, 'admin', undefined), false);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { attentionReasons, attentionLink } from './executive-attention.ts';

const clean = {
  projectId: '11111111-1111-4111-8111-111111111111', gateSeq: 2, health: 'on_track',
  criteriaTotal: 3, criteriaUnmet: 0, approversTotal: 1,
  accountableTotal: 1, approvalsPending: 0, approvalsRejected: 0,
  raidBlockers: 0, priorUnapproved: 0, criticalRaid: 0, overdueRaid: 0,
};
const keys = row => attentionReasons(row).map(r => r.key);

test('healthy project without blockers only returns neutral fallback', () => {
  assert.deepEqual(keys(clean), ['health flag, no blocker recorded']);
});
test('missing gate checklist is a governance issue', () => {
  assert.ok(keys({ ...clean, criteriaTotal: 0 }).includes('Missing gate checklist'));
});
test('unmet criteria includes correct count', () => {
  assert.deepEqual(attentionReasons({ ...clean, criteriaUnmet: 2 }).at(0),
    { key: 'Unmet criteria', count: 2 });
});
test('missing approvers blocks sign-off', () => {
  assert.ok(keys({ ...clean, approversTotal: 0, accountableTotal: 0 }).includes('No approvers assigned'));
});
test('an unaccountable approver is not enough', () => {
  assert.ok(keys({ ...clean, accountableTotal: 0 }).includes('No accountable approver'));
});
test('pending approvals are surfaced', () => {
  assert.ok(keys({ ...clean, approvalsPending: 1 }).includes('Pending signatures'));
});
test('rejected approvals are surfaced', () => {
  assert.ok(keys({ ...clean, approvalsRejected: 1 }).includes('Rejected approvals'));
});
test('unapproved previous gates are surfaced', () => {
  assert.ok(keys({ ...clean, priorUnapproved: 1 }).includes('Unapproved prior gates'));
});
test('RAID blockers are surfaced', () => {
  assert.ok(keys({ ...clean, raidBlockers: 3 }).includes('Open gate blockers'));
});
test('critical RAID items surface without active gates', () => {
  assert.deepEqual(attentionReasons({ ...clean, gateSeq: null, criticalRaid: 1 }),
    [{ key: 'Critical RAID items', count: 1 }]);
});
test('overdue RAID items surface without active gates', () => {
  assert.deepEqual(attentionReasons({ ...clean, gateSeq: null, overdueRaid: 4 }),
    [{ key: 'Overdue RAID items', count: 4 }]);
});
test('project link safely encodes a path segment', () => {
  assert.equal(attentionLink({ ...clean, projectId: 'unsafe/?#' }), '/governance/unsafe%2F%3F%23');
});
test('no active gate routes to RAID board', () => {
  assert.equal(attentionLink({ ...clean, gateSeq: null }), '/raid');
});

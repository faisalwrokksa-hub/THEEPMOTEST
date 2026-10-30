import test from 'node:test';
import assert from 'node:assert/strict';
import { validProjectCursor, validProjectHealth, projectPageHref, projectGovernanceHref, filterProjectPage } from './projects-pagination.ts';

const cursor = '2026-10-30T16:20:43.000Z';
const program = '11111111-1111-4111-8111-111111111111';

test('only canonical API timestamps are accepted as project cursors', () => {
  assert.equal(validProjectCursor(cursor), cursor);
  for (const value of ['not-a-date', '2026-10-30', '2026-02-30T00:00:00.000Z', null, [], 'x'.repeat(100)]) {
    assert.equal(validProjectCursor(value), undefined);
  }
});

test('next page preserves programme and health context without unsafe redirects', () => {
  const href = projectPageHref(cursor, program, 'at_risk');
  const url = new URL(href, 'https://theepmo.com');
  assert.equal(url.pathname, '/projects');
  assert.equal(url.searchParams.get('cursor'), cursor);
  assert.equal(url.searchParams.get('program'), program);
  assert.equal(url.searchParams.get('health'), 'at_risk');
  assert.equal(projectPageHref(null), '/projects');
  assert.equal(projectPageHref(null, program), `/projects?program=${program}`);
});

test('invalid health query never hides the full project list', () => {
  for (const valid of ['on_track', 'at_risk', 'critical']) {
    assert.equal(validProjectHealth(valid), valid);
  }
  for (const invalid of ['unknown', 'critical%20', '', null, [], {}, 'CRITICAL']) {
    assert.equal(validProjectHealth(invalid), undefined);
  }
});

test('programme drilldown opens the selected project governance record', () => {
  const id = '11111111-1111-4111-8111-111111111111';
  assert.equal(projectGovernanceHref(id), `/governance/${id}`);
});

test('health filtering is page-scoped and does not mutate the API page', () => {
  const rows = [{ id: '1', health: 'on_track' }, { id: '2', health: 'critical' }];
  assert.deepEqual(filterProjectPage(rows, 'critical'), [{ id: '2', health: 'critical' }]);
  assert.deepEqual(filterProjectPage(rows, 'at_risk'), []);
  assert.deepEqual(filterProjectPage(rows), rows);
  assert.equal(rows.length, 2);
});

test('clearing health keeps programme scope but resets pagination', () => {
  const url = new URL(projectPageHref(null, program), 'https://theepmo.com');
  assert.equal(url.searchParams.get('program'), program);
  assert.equal(url.searchParams.has('cursor'), false);
  assert.equal(url.searchParams.has('health'), false);
});

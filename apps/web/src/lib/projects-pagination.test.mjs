import test from 'node:test';
import assert from 'node:assert/strict';
import { validProjectCursor, projectPageHref } from './projects-pagination.ts';

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

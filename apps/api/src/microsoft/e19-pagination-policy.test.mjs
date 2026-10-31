import test from 'node:test';
import assert from 'node:assert/strict';
import { assertMicrosoftPageVisit, MAX_MICROSOFT_PAGES, microsoftPageItems } from './pagination-policy.ts';
import { microsoftApiUrl } from './url-policy.ts';

const graph = 'https://graph.microsoft.com/v1.0';

test('pagination returns at most the caller cap and preserves a valid continuation', () => {
  const page = microsoftPageItems({ value: [1, 2, 3], '@odata.nextLink': graph + '/me?$skip=3' }, 2);
  assert.deepEqual(page.items, [1, 2]);
  assert.equal(page.next, graph + '/me?$skip=3');
  assert.deepEqual(microsoftPageItems({ value: [] }, 10), { items: [], next: undefined });
});

test('pagination rejects malformed Microsoft responses and continuation types', () => {
  for (const page of [null, {}, { value: null }, { value: {} }, { value: [], '@odata.nextLink': {} },
    { value: [], '@odata.nextLink': '' }, { value: [], '@odata.nextLink': 42 }]) {
    assert.throws(() => microsoftPageItems(page, 5));
  }
});

test('repeated page URLs and excessive empty-page chains fail closed', () => {
  const seen = new Set();
  const url = microsoftApiUrl(graph, '/me/drive');
  assertMicrosoftPageVisit(url, seen, 0);
  assert.throws(() => assertMicrosoftPageVisit(
    microsoftApiUrl(graph, graph + '/me/drive'), seen, 1), /repeated/);
  assert.throws(() => assertMicrosoftPageVisit(graph + '/me', seen, MAX_MICROSOFT_PAGES), /maximum/);
  assert.equal(seen.size, 1);
});

test('nextLink origin and path restrictions still apply before any subsequent request', () => {
  for (const next of ['https://attacker.example/collect', 'http://graph.microsoft.com/v1.0/me',
    'https://graph.microsoft.com/beta/me', '//attacker.example/collect']) {
    assert.throws(() => microsoftApiUrl(graph, next));
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { uuidPathSegment } from './uuid-path.mjs';

const id = '11111111-1111-4111-8111-111111111111';

test('valid UUID resource IDs are preserved without changing API routing', () => {
  assert.equal(uuidPathSegment(id), id);
  assert.equal(uuidPathSegment(id.toUpperCase()), id.toUpperCase());
});

test('malicious path, query, fragment and malformed resource IDs fail closed', () => {
  for (const value of [
    '', '../super-admin/tenants', 'abc/../../auth/session',
    id + '?tenantId=other', id + '#fragment', id + '&other=true',
    id + '%2F..', id + '/extra', 'not-a-uuid', '  ' + id,
    null, undefined, 42, {}, '\n' + id,
  ]) {
    assert.throws(() => uuidPathSegment(value), /Invalid resource identifier/);
  }
});

test('every dynamic authenticated resource URL uses UUID validation', () => {
  const api = readFileSync(new URL('./api.ts', import.meta.url), 'utf8');
  assert.match(api, /import \{ uuidPathSegment \} from '\.\/uuid-path\.mjs'/);
  assert.match(api, /ask\/thread\/\$\{uuidPathSegment\(id\)\}/);
  assert.match(api, /microsoft\/files\$\{projectId \? `\?projectId=\$\{uuidPathSegment\(projectId\)\}`/);
  assert.match(api, /super-admin\/tenants\/\$\{uuidPathSegment\(id\)\}\/subscriptions/);
  assert.match(api, /projects\/\$\{uuidPathSegment\(id\)\}\/governance/);
  assert.doesNotMatch(api, /ask\/thread\/\$\{id\}/);
  assert.doesNotMatch(api, /projects\/\$\{id\}\/governance/);
});

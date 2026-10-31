import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validCreateKind } from './create-kind.mjs';

test('every supported customer create route has an exact allowlisted kind', () => {
  for (const kind of ['portfolio', 'program', 'project', 'raid', 'task', 'update',
    'benefit', 'stakeholder', 'schedule-item', 'cost', 'allocation', 'document']) {
    assert.equal(validCreateKind(kind), kind);
  }
});

test('legacy direct member creation and arbitrary paths are rejected', () => {
  for (const kind of ['member', 'member/123', '', '.', '..', '../auth/logout-all',
    '../../auth/logout', 'project/../member', '/auth/logout-all',
    '//attacker.example', 'project?x=1', 'project#fragment', 'project%2F..',
    'Project', ' project', 'project ', null, undefined, [], {}, 42]) {
    assert.equal(validCreateKind(kind), null);
  }
});

test('create route validates kind before forwarding the authenticated request', () => {
  const source = readFileSync(new URL('../app/api/create/route.ts', import.meta.url), 'utf8');
  assert.match(source, /import \{ validCreateKind \} from ['"]@\/lib\/create-kind\.mjs['"]/);
  assert.match(source, /const kind = validCreateKind\(f\.get\('__kind'\)\)/);
  assert.ok(source.indexOf('if (!kind)') > source.indexOf('const kind = validCreateKind'));
  assert.ok(source.indexOf('if (!kind)') < source.indexOf('fetchTenantMutation(fetch,'));
});

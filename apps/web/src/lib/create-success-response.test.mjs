import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readBoundedUpstreamJson } from './bounded-upstream-body.mjs';

test('project-create success response accepts only complete small JSON', async () => {
  const id = '11111111-1111-4111-8111-111111111111';
  assert.deepEqual(await readBoundedUpstreamJson(new Response(JSON.stringify({ id })), 16384), { id });
  assert.equal(await readBoundedUpstreamJson(new Response('x'.repeat(16385)), 16384), null);
  assert.equal(await readBoundedUpstreamJson(new Response('{broken'), 16384), null);
});

test('successful project creation never buffers unbounded upstream JSON', () => {
  const source = readFileSync(new URL('../app/api/create/route.ts', import.meta.url), 'utf8');
  assert.match(source, /const created = await readBoundedUpstreamJson\(res, 16384\) \?\? \{\};/);
  assert.doesNotMatch(source, /await res\.json\(\)/);
  assert.match(source, /if \(kind === 'project'\)/);
  assert.match(source, /url\.searchParams\.set\('done', kind\)/);
});

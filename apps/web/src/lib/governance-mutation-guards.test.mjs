import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readBoundedBrowserForm } from './bounded-browser-form.mjs';
import { fetchTenantMutation } from './tenant-mutation-fetch.mjs';
import { uuidPathSegment } from './uuid-path.mjs';
import { safeMutationError } from './safe-mutation-feedback.mjs';

const source = readFileSync(new URL('../app/api/govern/route.ts', import.meta.url), 'utf8');

test('governance rejects oversized forms before parsing or forwarding a mutation', async () => {
  let cancelled = false;
  const body = new ReadableStream({
    start(controller) { controller.enqueue(new Uint8Array(131073)); },
    cancel() { cancelled = true; },
  });
  const request = {
    url: 'https://theepmo.com/api/govern',
    headers: new Headers({ 'content-type': 'application/x-www-form-urlencoded' }),
    body,
  };
  const result = await readBoundedBrowserForm(request);
  assert.equal(result.form, null);
  assert.equal(result.error, 'too-large');
  assert.equal(cancelled, true);
});

test('governance mutation transport does not follow redirects or retry', async () => {
  let calls = 0;
  const response = await fetchTenantMutation(async (_url, init) => {
    calls++;
    assert.equal(init.redirect, 'error');
    assert.equal(init.cache, 'no-store');
    return new Response(null, { status: 307, headers: { location: 'https://other.invalid' } });
  }, 'https://api.theepmo.com/api/v1/gates/uuid/advance', { method: 'POST' });
  assert.equal(response, null);
  assert.equal(calls, 1);
});

test('governance ID traversal and upstream error disclosure are blocked', () => {
  assert.throws(() => uuidPathSegment('../auth/session'), /Invalid resource identifier/);
  assert.throws(() => uuidPathSegment('a?tenantId=other'), /Invalid resource identifier/);
  assert.equal(safeMutationError(500).includes('SQL'), false);
  assert.match(source, /readBoundedBrowserForm\(req\)/);
  assert.match(source, /fetchTenantMutation\(fetch,/);
  assert.match(source, /uuidPathSegment\(f\.get\('id'\)\)/);
  assert.match(source, /safeMutationError\(res\?\.status \?\? 503\)/);
  assert.doesNotMatch(source, /req\.formData\(\)/);
  assert.doesNotMatch(source, /res\.json\(\)/);
  assert.doesNotMatch(source, /await fetch\(\`\$\{BASE\}\$\{path\}/);
});

test('all seven governance operations use the validated resource ID', () => {
  for (const endpoint of [
    'gate-criteria', 'approvals', 'gates', 'raid', 'tasks',
  ]) assert.match(source, new RegExp('/api/v1/' + endpoint));
  assert.equal((source.match(/\$\{id\}/g) ?? []).length, 7);
  assert.match(source, /status: parsed\.error === 'too-large' \? 413 : 400/);
});

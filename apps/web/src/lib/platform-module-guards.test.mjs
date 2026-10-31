import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readBoundedBrowserForm } from './bounded-browser-form.mjs';
import { fetchTenantMutation } from './tenant-mutation-fetch.mjs';
import { safeMutationError } from './safe-mutation-feedback.mjs';

const source = readFileSync(new URL('../app/api/platform/route.ts', import.meta.url), 'utf8');

test('module toggles reject oversized browser forms before a write', async () => {
  const request = new Request('https://theepmo.com/api/platform', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: 'id=' + 'a'.repeat(131073),
  });
  const result = await readBoundedBrowserForm(request);
  assert.equal(result.error, 'too-large');
  assert.equal(result.form, null);
});

test('module toggles accept bounded ordinary form submissions', async () => {
  const request = new Request('https://theepmo.com/api/platform', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: 'id=finance&enabled=true',
  });
  const result = await readBoundedBrowserForm(request);
  assert.equal(result.error, null);
  assert.equal(result.form.get('id'), 'finance');
});

test('module toggle transport does not follow redirect or retry', async () => {
  let calls = 0;
  const response = await fetchTenantMutation(async (_url, init) => {
    calls++;
    assert.equal(init.redirect, 'error');
    return new Response(null, { status: 308, headers: { location: 'https://other.invalid' } });
  }, 'https://api.theepmo.com/api/v1/platform/modules/finance', { method: 'PATCH' });
  assert.equal(response, null);
  assert.equal(calls, 1);
});

test('module ID is allowlisted and upstream error bodies never reach redirects', () => {
  assert.match(source, /readBoundedBrowserForm\(req\)/);
  assert.match(source, /status: parsed\.error === 'too-large' \? 413 : 400/);
  assert.match(source, /\^\[a-z\]\[a-z0-9_-\]\{0,63\}\$/);
  assert.match(source, /fetchTenantMutation\(fetch,/);
  assert.match(source, /safeMutationError\(res\?\.status \?\? 503\)/);
  assert.doesNotMatch(source, /req\.formData\(\)/);
  assert.doesNotMatch(source, /res\.json\(\)/);
  assert.equal(safeMutationError(500).includes('SQL'), false);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readBoundedBrowserForm } from './bounded-browser-form.mjs';
import { fetchTenantMutation } from './tenant-mutation-fetch.mjs';
import { safeMutationError } from './safe-mutation-feedback.mjs';

const source = readFileSync(new URL('../app/api/super-admin/route.ts', import.meta.url), 'utf8');

test('super-admin rejects oversized form before privileged writes', async () => {
  let cancelled = false;
  const request = {
    url: 'https://theepmo.com/api/super-admin',
    headers: new Headers({ 'content-type': 'application/x-www-form-urlencoded' }),
    body: new ReadableStream({
      start(controller) { controller.enqueue(new Uint8Array(131073)); },
      cancel() { cancelled = true; },
    }),
  };
  const result = await readBoundedBrowserForm(request);
  assert.equal(result.form, null);
  assert.equal(result.error, 'too-large');
  assert.equal(cancelled, true);
});

test('super-admin accepts bounded complete form', async () => {
  const request = new Request('https://theepmo.com/api/super-admin', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: 'action=create-plan&code=starter',
  });
  const result = await readBoundedBrowserForm(request);
  assert.equal(result.error, null);
  assert.equal(result.form.get('action'), 'create-plan');
});

test('privileged subscription mutations never follow redirects or retry', async () => {
  let calls = 0;
  const response = await fetchTenantMutation(async (_url, init) => {
    calls++;
    assert.equal(init.redirect, 'error');
    assert.equal(init.cache, 'no-store');
    return new Response(null, { status: 307, headers: { location: 'https://evil.invalid' } });
  }, 'https://api.theepmo.com/api/v1/super-admin/plans', { method: 'POST' });
  assert.equal(response, null);
  assert.equal(calls, 1);
});

test('super-admin route bounds forms and never reflects upstream diagnostics', () => {
  assert.match(source, /readBoundedBrowserForm\(req\)/);
  assert.match(source, /status: parsed\.error === 'too-large' \? 413 : 400/);
  assert.match(source, /fetchTenantMutation\(fetch,/);
  assert.match(source, /safeMutationError\(response\?\.status \?\? 503\)/);
  assert.doesNotMatch(source, /req\.formData\(\)/);
  assert.doesNotMatch(source, /response\?\.json\(\)/);
  assert.doesNotMatch(source, /failure\?\.message/);
  assert.equal(safeMutationError(500).includes('SQL'), false);
  for (const operation of ['create-plan', 'update-plan', 'manual-grant', 'cancel']) {
    assert.ok(source.includes(operation), 'missing privileged operation ' + operation);
  }
  assert.match(source, /uuid\.test\(tenantId\)/);
  assert.match(source, /uuid\.test\(subscriptionId\)/);
  assert.match(source, /code\.test\(plan\)/);
});

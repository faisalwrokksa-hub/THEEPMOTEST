import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readBoundedBrowserForm } from './bounded-browser-form.mjs';
import { fetchTenantMutation } from './tenant-mutation-fetch.mjs';
import { uuidPathSegment } from './uuid-path.mjs';
import { safeMutationError } from './safe-mutation-feedback.mjs';

const source = readFileSync(new URL('../app/api/session/tenant/route.ts', import.meta.url), 'utf8');

test('workspace switching rejects incomplete and oversized forms before API writes', async () => {
  const request = new Request('https://theepmo.com/api/session/tenant', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: 'tenantId=' + 'x'.repeat(131073),
  });
  const parsed = await readBoundedBrowserForm(request);
  assert.equal(parsed.error, 'too-large');
  assert.equal(parsed.form, null);
});

test('workspace switching validates tenant UUIDs before authenticated fetch', () => {
  assert.throws(() => uuidPathSegment('../other-tenant'), /Invalid resource identifier/);
  assert.throws(() => uuidPathSegment('tenant?admin=1'), /Invalid resource identifier/);
  assert.equal(uuidPathSegment('00000000-0000-4000-8000-000000000001'), '00000000-0000-4000-8000-000000000001');
  assert.match(source, /uuidPathSegment\(form\.get\('tenantId'\)\)/);
});

test('workspace switching does not follow redirects or retry session mutations', async () => {
  let calls = 0;
  const response = await fetchTenantMutation(async (_url, init) => {
    calls++;
    assert.equal(init.redirect, 'error');
    return new Response(null, { status: 302, headers: { location: 'https://other.invalid' } });
  }, 'https://api.theepmo.com/auth/switch-tenant', { method: 'POST' });
  assert.equal(response, null);
  assert.equal(calls, 1);
});

test('failed workspace switch surfaces safe error instead of pretending success', () => {
  assert.match(source, /readBoundedBrowserForm\(req\)/);
  assert.match(source, /fetchTenantMutation\(fetch,/);
  assert.match(source, /if \(!response\?\.ok\)/);
  assert.match(source, /publicUrl\(req, '\/settings'\)/);
  assert.match(source, /safeMutationError\(response\?\.status \?\? 503\)/);
  assert.match(source, /safeReturnPath\(to, '\/'\)/);
  assert.doesNotMatch(source, /req\.formData\(\)/);
  assert.doesNotMatch(source, /\.catch\(\(\) => \{\}\)/);
  assert.equal(safeMutationError(500).includes('password'), false);
});

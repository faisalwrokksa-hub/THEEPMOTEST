import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validSessionEnvelope } from './session-envelope.mjs';
import { readBoundedUpstreamJson } from './bounded-upstream-body.mjs';

const signedIn = {
  authenticated: true,
  userId: 'user-1',
  email: 'user@example.test',
  displayName: 'Example User',
  tenantId: 'tenant-1',
  tenantName: 'Workspace',
  role: 'owner',
  capabilities: ['read'],
  tenants: [{ tenantId: 'tenant-1', name: 'Workspace', slug: 'workspace', role: 'owner' }],
};

test('valid signed-out and signed-in session envelopes remain supported', () => {
  assert.equal(validSessionEnvelope({ authenticated: false }), true);
  assert.equal(validSessionEnvelope(signedIn), true);
});

test('malformed or truncated session envelopes cannot grant a signed-in UI', () => {
  for (const value of [null, [], {}, { authenticated: 'true' },
    { authenticated: true }, { ...signedIn, tenantId: '' },
    { ...signedIn, capabilities: 'read' },
    { ...signedIn, capabilities: [null] },
    { ...signedIn, tenants: null }]) {
    assert.equal(validSessionEnvelope(value), false);
  }
});

test('incomplete account and workspace fields fail closed before rendering the switcher', () => {
  const invalid = [
    { ...signedIn, email: undefined },
    { ...signedIn, displayName: null },
    { ...signedIn, role: undefined },
    { ...signedIn, tenantName: '' },
    { ...signedIn, capabilities: ['read', null] },
    { ...signedIn, tenants: [] },
    { ...signedIn, tenants: [null] },
    { ...signedIn, tenants: [{ tenantId: 'tenant-1', name: null, slug: 'workspace', role: 'owner' }] },
    { ...signedIn, tenants: [{ tenantId: 'tenant-1', name: 'Workspace', slug: '', role: 'owner' }] },
    { ...signedIn, tenants: [{ tenantId: 'tenant-2', name: 'Other', slug: 'other', role: 'owner' }] },
    { ...signedIn, tenants: [{ tenantId: 'tenant-1', name: 'Workspace', slug: 'workspace', role: 'viewer' }] },
    { ...signedIn, tenants: [signedIn.tenants[0], signedIn.tenants[0]] },
  ];
  for (const value of invalid) {
    assert.equal(validSessionEnvelope(value), false, JSON.stringify(value));
  }
  assert.equal(validSessionEnvelope({ ...signedIn, capabilities: [] }), true);
  assert.equal(validSessionEnvelope({ authenticated: false }), true);
});

test('session validator guards the fields dereferenced by TenantSwitcher', () => {
  const switcher = readFileSync(new URL('../components/TenantSwitcher.tsx', import.meta.url), 'utf8');
  const validator = readFileSync(new URL('./session-envelope.mjs', import.meta.url), 'utf8');
  assert.match(switcher, /session\.displayName\.split/);
  assert.match(switcher, /session\.role\.replace/);
  assert.match(switcher, /t\.name\.slice/);
  for (const field of ['displayName', 'role', 'tenantName', 'email', 'tenants']) {
    assert.match(validator, new RegExp('value\\.' + field));
  }
  for (const field of ['tenantId', 'name', 'slug', 'role']) {
    assert.match(validator, new RegExp('tenant\\.' + field));
  }
});

test('session JSON is bounded to 64 KiB and oversized streams are cancelled', async () => {
  assert.deepEqual(await readBoundedUpstreamJson(new Response(JSON.stringify(signedIn)), 65536), signedIn);
  let cancelled = false;
  const body = new ReadableStream({
    start(controller) { controller.enqueue(new Uint8Array(65537)); },
    cancel() { cancelled = true; },
  });
  assert.equal(await readBoundedUpstreamJson({ body }, 65536), null);
  assert.equal(cancelled, true);
});

test('layout and nested pages use one request-cached, bounded session lookup', () => {
  const api = readFileSync(new URL('./api.ts', import.meta.url), 'utf8');
  assert.match(api, /import \{ cache \} from 'react'/);
  assert.match(api, /const readSession = cache\(async \(\): Promise<Session> => \{/);
  assert.match(api, /get<unknown>\('\/auth\/session', 65536\)/);
  assert.match(api, /if \(!validSessionEnvelope\(value\)\)/);
  assert.equal((api.match(/return await readSession\(\)/g) ?? []).length, 2);
  assert.doesNotMatch(api, /get<Session>\('\/auth\/session'\)/);
});

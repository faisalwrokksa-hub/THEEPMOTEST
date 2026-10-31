import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validSessionEnvelope } from './session-envelope.mjs';
import { readBoundedUpstreamJson } from './bounded-upstream-body.mjs';

const signedIn = {
  authenticated: true,
  userId: 'user-1',
  tenantId: 'tenant-1',
  capabilities: ['read'],
  tenants: [{ tenantId: 'tenant-1', name: 'Workspace' }],
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

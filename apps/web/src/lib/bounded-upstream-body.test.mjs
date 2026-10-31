import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readBoundedUpstreamText, readBoundedUpstreamJson } from './bounded-upstream-body.mjs';

test('bounded text preserves a small complete license refusal', async () => {
  const body = '{"message":"subscription expired"}';
  assert.equal(await readBoundedUpstreamText(new Response(body), 4096), body);
  assert.equal((await readBoundedUpstreamText(new Response('a'.repeat(4096)), 4096)).length, 4096);
});

test('oversized upstream error is discarded and the stream is cancelled', async () => {
  let cancelled = false;
  const body = new ReadableStream({
    start(controller) { controller.enqueue(new Uint8Array(4097)); },
    cancel() { cancelled = true; },
  });
  assert.equal(await readBoundedUpstreamText({ body }, 4096), '');
  assert.equal(cancelled, true);
  assert.equal(await readBoundedUpstreamText(new Response('x'.repeat(16385)), 16384), '');
});

test('malformed and failed upstream bodies fail closed', async () => {
  assert.equal(await readBoundedUpstreamText(null), '');
  assert.equal(await readBoundedUpstreamText({ body: null }), '');
  assert.equal(await readBoundedUpstreamText(new Response(new Uint8Array([0xff]))), '');
  const body = new ReadableStream({ pull() { throw new Error('upstream broke'); } });
  assert.equal(await readBoundedUpstreamText({ body }), '');
});

test('bounded JSON keeps safe validation structure but rejects oversized or malformed payloads', async () => {
  const payload = { issues: [{ path: 'name', message: 'required' }] };
  assert.deepEqual(await readBoundedUpstreamJson(new Response(JSON.stringify(payload))), payload);
  assert.equal(await readBoundedUpstreamJson(new Response('{bad json}')), null);
  assert.equal(await readBoundedUpstreamJson(new Response('x'.repeat(16385))), null);
});

test('both authenticated API reads and create validation use bounded response readers', () => {
  const api = readFileSync(new URL('./api.ts', import.meta.url), 'utf8');
  const create = readFileSync(new URL('../app/api/create/route.ts', import.meta.url), 'utf8');
  assert.match(api, /readBoundedUpstreamText\(res, 4096\)/);
  assert.match(create, /readBoundedUpstreamJson\(res, 16384\)/);
  assert.doesNotMatch(api, /await res\.text\(/);
  assert.doesNotMatch(create, /await res\.json\(\)\.catch\(\(\) => null\)/);
});

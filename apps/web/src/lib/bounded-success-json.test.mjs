import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readBoundedSuccessJson } from './bounded-success-json.mjs';

test('bounded API success reader preserves small complete JSON and UTF-8', async () => {
  const payload = { items: [{ name: 'مشروع تجريبي' }], nextCursor: null };
  assert.deepEqual(await readBoundedSuccessJson(new Response(JSON.stringify(payload)), 1024), payload);
});

test('oversized streamed success response is rejected and cancelled', async () => {
  let cancelled = false;
  const body = new ReadableStream({
    start(controller) { controller.enqueue(new Uint8Array(257)); },
    cancel() { cancelled = true; },
  });
  await assert.rejects(readBoundedSuccessJson({ body }, 256), /too large/);
  assert.equal(cancelled, true);
});

test('declared oversized payload is rejected before opening a stream', async () => {
  let opened = false;
  const response = {
    headers: new Headers({ 'content-length': '257' }),
    body: { getReader() { opened = true; throw new Error('should not open'); } },
  };
  await assert.rejects(readBoundedSuccessJson(response, 256), /too large/);
  assert.equal(opened, false);
});

test('malformed JSON, missing body and invalid limits fail closed', async () => {
  await assert.rejects(readBoundedSuccessJson(new Response('{bad json}')), SyntaxError);
  await assert.rejects(readBoundedSuccessJson({ body: null }), /Missing/);
  await assert.rejects(readBoundedSuccessJson(new Response('{}'), 0), /limit/);
  await assert.rejects(readBoundedSuccessJson(new Response('{}'), 16 * 1024 * 1024 + 1), /limit/);
});

test('authenticated API success paths no longer use unlimited Response.json()', () => {
  const api = readFileSync(new URL('./api.ts', import.meta.url), 'utf8');
  assert.match(api, /readBoundedSuccessJson\(res, 16 \* 1024 \* 1024\)/);
  assert.doesNotMatch(api, /res\.json\(\)/);
  assert.match(api, /throw new ApiError\(502, 'Invalid API response'\)/);
  assert.match(api, /readBoundedUpstreamJson\(res, maxResponseBytes\)/);
});

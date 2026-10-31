/** P0 regression: OAuth/Graph responses must not buffer unbounded upstream bytes. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  readBoundedMicrosoftJson,
  MAX_MICROSOFT_API_RESPONSE_BYTES,
  MAX_MICROSOFT_TOKEN_RESPONSE_BYTES,
} from '../apps/api/src/microsoft/response-policy.ts';

const streamed = (chunks, headers = {}) => new Response(new ReadableStream({
  start(controller) {
    for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk));
    controller.close();
  },
}), { headers });

test('valid bounded token and Graph responses parse correctly', async () => {
  assert.deepEqual(await readBoundedMicrosoftJson(streamed(['{"access_', 'token":"ok"}']),
    MAX_MICROSOFT_TOKEN_RESPONSE_BYTES), { access_token: 'ok' });
  assert.deepEqual(await readBoundedMicrosoftJson(streamed(['{"value":[1,2]}']),
    MAX_MICROSOFT_API_RESPONSE_BYTES), { value: [1, 2] });
});

test('oversized or invalid Content-Length fails before buffering', async () => {
  await assert.rejects(readBoundedMicrosoftJson(streamed(['{}'], { 'content-length': '65537' }),
    MAX_MICROSOFT_TOKEN_RESPONSE_BYTES), /permitted size/);
  await assert.rejects(readBoundedMicrosoftJson(streamed(['{}'], { 'content-length': 'not-a-number' }),
    MAX_MICROSOFT_TOKEN_RESPONSE_BYTES), /permitted size/);
});

test('unannounced oversized chunked response fails during streaming', async () => {
  await assert.rejects(readBoundedMicrosoftJson(streamed(['{"x":"', 'a'.repeat(64), '"}']), 64),
    /permitted size/);
  assert.deepEqual(await readBoundedMicrosoftJson(streamed(['{}']), 2), {});
});

test('malformed upstream JSON errors never echo sensitive body content', async () => {
  await assert.rejects(readBoundedMicrosoftJson(streamed(['secret=do-not-log']), 1024),
    error => /malformed JSON/.test(error.message) && !error.message.includes('do-not-log'));
});

test('both Microsoft OAuth and bearer-authenticated API callers use stream limits', () => {
  const source = readFileSync(new URL('../apps/api/src/microsoft/client.ts', import.meta.url), 'utf8');
  assert.match(source, /await readBoundedMicrosoftJson\(res, MAX_MICROSOFT_TOKEN_RESPONSE_BYTES\)/);
  assert.match(source, /await readBoundedMicrosoftJson\(res, MAX_MICROSOFT_API_RESPONSE_BYTES\)/);
  assert.doesNotMatch(source, /await res\.(json|text)\(\)/);
});

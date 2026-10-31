/** P0 regression: preauthenticated Microsoft upload URLs must not amplify upstream bodies. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readBoundedMicrosoftJson } from '../apps/api/src/microsoft/response-policy.ts';

const service = readFileSync(new URL('../apps/api/src/microsoft/microsoft.service.ts', import.meta.url), 'utf8');
const start = service.indexOf('private async uploadLarge(');
const end = service.indexOf('async documentLink(', start);
const upload = service.slice(start, end);

test('upload chunks reject unexpected success, oversized metadata and upstream body reflection', () => {
  assert.ok(start >= 0 && end > start);
  assert.match(upload, /if \(end !== buf\.length\)/);
  assert.match(upload, /res\.status !== 202/);
  assert.match(upload, /readBoundedMicrosoftJson\(res, MAX_MICROSOFT_API_RESPONSE_BYTES\)/);
  assert.doesNotMatch(upload, /await res\.(text|json)\(\)/);
  assert.doesNotMatch(upload, /\$\{why\}|\$\{res\.statusText\}/);
  assert.match(upload, /await res\.body\?\.cancel\(\)/);
});

test('upload metadata parser refuses excessive chunked JSON without returning body', async () => {
  const response = new Response(new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('{"id":"'));
      controller.enqueue(new TextEncoder().encode('x'.repeat(40)));
      controller.close();
    },
  }));
  await assert.rejects(readBoundedMicrosoftJson(response, 32), /permitted size/);
});

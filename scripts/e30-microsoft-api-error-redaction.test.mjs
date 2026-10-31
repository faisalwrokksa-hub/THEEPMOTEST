import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { safeMicrosoftApiFailure } from '../apps/api/src/microsoft/api-error-policy.ts';

test('Graph and Power BI failures expose only reviewed status-based messages', () => {
  const expected = new Map([
    [401, 'unauthorized'], [403, 'forbidden'], [404, 'notFound'],
    [429, 'rateLimited'], [400, 'upstreamFailure'], [500, 'upstreamFailure'],
    [503, 'upstreamFailure'],
  ]);
  for (const [status, code] of expected) {
    const failure = safeMicrosoftApiFailure(status);
    assert.equal(failure.code, code);
    assert.match(failure.message, /^Microsoft /);
    assert.doesNotMatch(failure.message, /https?:|token|secret|\\r|\\n/i);
  }
});

test('Microsoft API client does not promote upstream error text or codes into exceptions', () => {
  const client = readFileSync(new URL('../apps/api/src/microsoft/client.ts', import.meta.url), 'utf8');
  assert.match(client, /safeMicrosoftApiFailure\\(res\\.status\\)/);
  assert.match(client, /new MsApiError\\(res\\.status, failure\\.code, failure\\.message\\)/);
  assert.doesNotMatch(client, /json\\?\\.error|e\\.message\\s*\\?\\?|e\\.detail\\s*\\?\\?/);
  assert.match(client, /redirect: 'error'/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { safeRequestId, safeRouteLabel, safeErrorKind } from '../apps/api/src/common/log-safety.ts';

const middleware = readFileSync('apps/api/src/common/request-log.middleware.ts', 'utf8');
const filter = readFileSync('apps/api/src/common/all-exceptions.filter.ts', 'utf8');
const ms = readFileSync('apps/api/src/microsoft/client.ts', 'utf8');

test('accepts a bounded safe correlation ID', () => assert.equal(safeRequestId('request_ABC-1234'), 'request_ABC-1234'));
test('rejects untrusted correlation ID with newlines', () => assert.match(safeRequestId('example123\nFORGED'), /^[0-9a-f-]{36}$/));
test('rejects oversized correlation ID', () => assert.match(safeRequestId('x'.repeat(100000)), /^[0-9a-f-]{36}$/));
test('rejects a list of request IDs', () => assert.match(safeRequestId(['request_1234']), /^[0-9a-f-]{36}$/));
test('logs route template, never concrete invite token', () => assert.equal(safeRouteLabel({path: '/onboarding/accept/:token'}), '/onboarding/accept/:token'));
test('omits untrusted route path with query', () => assert.equal(safeRouteLabel({path: '/invitation?token=secret'}), '[unmatched]'));
test('omits unmatched URL instead of logging its query', () => assert.equal(safeRouteLabel(null), '[unmatched]'));
test('omits non-string route patterns', () => assert.equal(safeRouteLabel({path: /token=(.*)/}), '[unmatched]'));
test('never logs unknown exception names or messages', () => {
  const e = new Error('Bearer SECRET_TOKEN'); e.name = 'ProviderError SECRET_TOKEN';
  assert.equal(safeErrorKind(e), 'InternalError');
});
test('logs safe known exception classes', () => assert.equal(safeErrorKind(new TypeError('secret')), 'TypeError'));
test('request logger never reads raw URL or query string', () => {
  assert.doesNotMatch(middleware, /req\.(?:originalUrl|url)|req\.query/);
  assert.match(middleware, /safeRequestId\(req\.headers\['x-request-id'\]\)/);
  assert.match(middleware, /safeRouteLabel\(req\.route\)/);
});
test('exception filter never exposes stack or message for 5xx', () => {
  assert.doesNotMatch(filter, /\.stack|req\.(?:url|originalUrl)|\(err as Error\)\.message/);
  assert.match(filter, /if \(status >= 500\)/);
  assert.match(filter, /safeErrorKind\(err\)/);
});
test('Microsoft Graph logger avoids remote error text and raw URL', () => {
  assert.doesNotMatch(ms, /log\.warn\(`\$\{init\.method/);
  assert.match(ms, /log\.warn\(`Microsoft API request failed/);
});

test('background jobs and integrations do not log provider message bodies or email addresses', () => {
  for (const file of [
    'apps/api/src/askx/askx.service.ts',
    'apps/api/src/notify/notify.service.ts',
    'apps/api/src/modules/trends.service.ts',
    'apps/api/src/microsoft/microsoft.service.ts',
  ]) {
    const source = readFileSync(file, 'utf8');
    assert.doesNotMatch(source, /this\.log\.(?:error|warn|log)\(`[^`]*\$\{(?:err\.message|\(e as Error\)\.message|who\.email)/, file);
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseMicrosoftTokenPayload } from '../apps/api/src/microsoft/token-response-policy.ts';

test('valid Microsoft bearer response preserves token and bounded expiry', () => {
  const t = parseMicrosoftTokenPayload({
    token_type: 'Bearer', access_token: 'opaque-access', refresh_token: 'opaque-refresh',
    expires_in: '3600', scope: 'Files.Read', id_token: 'opaque-id',
  }, 1000);
  assert.deepEqual(t, {
    accessToken: 'opaque-access', refreshToken: 'opaque-refresh',
    expiresAt: 3601000, scope: 'Files.Read', idToken: 'opaque-id',
  });
  assert.equal(parseMicrosoftTokenPayload({ access_token: 'ok', expires_in: 90 }, 0).expiresAt, 90000);
});

test('malformed Microsoft token responses fail closed before caching', () => {
  for (const response of [
    null, [], {}, { access_token: '', expires_in: 3600 },
    { access_token: 12, expires_in: 3600 },
    { access_token: 'ok' }, { access_token: 'ok', expires_in: 0 },
    { access_token: 'ok', expires_in: -1 },
    { access_token: 'ok', expires_in: 'Infinity' },
    { access_token: 'ok', expires_in: '3e99' },
    { access_token: 'ok', expires_in: 86401 },
    { access_token: 'ok', expires_in: 'NaN' },
    { access_token: 'ok', expires_in: 3600, token_type: 'Basic' },
    { access_token: 'ok', expires_in: 3600, refresh_token: '' },
    { access_token: 'ok', expires_in: 3600, refresh_token: {} },
    { access_token: 'ok', expires_in: 3600, scope: {} },
    { access_token: 'ok', expires_in: 3600, id_token: 1 },
  ]) {
    assert.throws(() => parseMicrosoftTokenPayload(response), /Invalid Microsoft token response/);
  }
});

test('OAuth exchange refuses upstream redirects before sending client credentials', () => {
  const client = readFileSync(new URL('../apps/api/src/microsoft/client.ts', import.meta.url), 'utf8');
  const token = client.slice(client.indexOf('async function token('), client.indexOf('export const exchangeCode'));
  assert.match(token, /redirect:\s*'error'/);
  assert.match(token, /return parseMicrosoftTokenPayload\(j\)/);
});

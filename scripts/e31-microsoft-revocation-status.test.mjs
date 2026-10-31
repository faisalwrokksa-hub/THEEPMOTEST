import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isActiveDelegatedMicrosoftConnection } from '../apps/api/src/microsoft/delegated-user-policy.ts';

test('only an explicitly connected delegated Microsoft credential is usable', () => {
  assert.equal(isActiveDelegatedMicrosoftConnection('connected'), true);
  for (const value of ['error', 'disconnected', 'pending', 'connected ', '', null, undefined, 1, true]) {
    assert.equal(isActiveDelegatedMicrosoftConnection(value), false, String(value));
  }
});

test('delegated token cache is gated by current database status and consenting user', () => {
  const source = readFileSync(new URL('../apps/api/src/microsoft/microsoft.service.ts', import.meta.url), 'utf8');
  const fn = source.slice(source.indexOf('private async accessToken('), source.indexOf('/* ── where the files go'));
  assert.match(fn, /SELECT refresh_token, connected_by, status FROM integration_connections/);
  assert.match(fn, /canUseDelegatedMicrosoftConnection\(row\.connected_by, userId\)/);
  assert.match(fn, /isActiveDelegatedMicrosoftConnection\(row\.status\)/);
  assert.ok(fn.indexOf('isActiveDelegatedMicrosoftConnection(row.status)') < fn.indexOf('this.tokens.get(cacheKey)'),
    'inactive credentials must fail before cached access tokens can be returned');
  assert.match(fn, /this\.invalidateTenantTokens\(tenantId\);\s+const msg = 'Microsoft credentials/);
  assert.match(fn, /AND status = 'connected' AND refresh_token = \$\{row\.refresh_token\}/);
});

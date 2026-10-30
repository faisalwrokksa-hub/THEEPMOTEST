import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const service = readFileSync(
  new URL('../apps/api/src/microsoft/microsoft.service.ts', import.meta.url), 'utf8');
const access = service.slice(
  service.indexOf('private async accessToken('), service.indexOf('async places('));
const refreshed = access.slice(access.indexOf('let tok;'));

test('delegated token refresh checks the stored credential even without rotation', () => {
  assert.match(refreshed, /const credential = tok\.refreshToken \? seal\(tok\.refreshToken\) : row\.refresh_token;/);
  assert.doesNotMatch(refreshed, /if \(tok\.refreshToken\)\s*\{\s*(?:credential|const updated)/);
  assert.equal((refreshed.match(/UPDATE integration_connections/g) ?? []).length, 2,
    'one error-path update and one unconditional successful-refresh update');
});

test('successful refresh uses tenant-scoped optimistic ownership and credential check', () => {
  const guard = refreshed.indexOf('const updated = await withTenant(tenantId');
  const owner = refreshed.indexOf('AND connected_by = ${userId}', guard);
  const credential = refreshed.indexOf('AND refresh_token = ${row.refresh_token}', guard);
  const returned = refreshed.indexOf('RETURNING id', guard);
  const cache = refreshed.indexOf('this.tokens.set(cacheKey', guard);
  assert.ok(guard >= 0 && owner > guard && credential > owner &&
    returned > credential && cache > returned);
});

test('stale connection rejects refreshed token and clears cached bearer', () => {
  const guard = refreshed.indexOf('const updated = await withTenant(tenantId');
  const rejection = refreshed.indexOf('if (!updated.length)', guard);
  const evict = refreshed.indexOf('this.tokens.delete(cacheKey)', rejection);
  const fail = refreshed.indexOf("throw new ConflictException('Microsoft connection changed during refresh.", rejection);
  const cache = refreshed.indexOf('this.tokens.set(cacheKey', rejection);
  assert.ok(rejection > guard && evict > rejection && fail > evict && cache > fail);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { canUseDelegatedMicrosoftConnection } from '../apps/api/src/microsoft/delegated-user-policy.ts';

const service = readFileSync(new URL('../apps/api/src/microsoft/microsoft.service.ts', import.meta.url), 'utf8');
const access = service.slice(service.indexOf('private async accessToken('), service.indexOf('async places('));

test('only the consenting EPMO user can use the delegated Microsoft identity', () => {
  assert.equal(canUseDelegatedMicrosoftConnection('admin-a', 'admin-a'), true);
  assert.equal(canUseDelegatedMicrosoftConnection('admin-a', 'admin-b'), false);
});

test('missing or legacy unowned connections fail closed', () => {
  for (const owner of [null, undefined, '']) {
    assert.equal(canUseDelegatedMicrosoftConnection(owner, 'admin-a'), false);
  }
  for (const user of [null, undefined, '']) {
    assert.equal(canUseDelegatedMicrosoftConnection('admin-a', user), false);
  }
});

test('the connection owner is checked before any cached Microsoft token is returned', () => {
  const read = access.indexOf('SELECT refresh_token, connected_by');
  const owner = access.indexOf('canUseDelegatedMicrosoftConnection(row.connected_by, userId)');
  const cache = access.indexOf('this.tokens.get(cacheKey)');
  assert.ok(read >= 0 && owner > read && cache > owner);
  assert.match(access, /throw new ForbiddenException\(/);
  assert.match(access, /cacheKey = `${tenantId}:${userId}:${resource}`/);
});

test('token rotation and error updates cannot overwrite a different consenting user', () => {
  assert.match(access, /WHERE provider = ${PROVIDER} AND connected_by = ${userId}\s+AND refresh_token = ${row.refresh_token}/);
  assert.match(access, /RETURNING id/);
  assert.match(access, /if \(!updated.length\)/);
});

test('reconnect and disconnect clear every user-scoped token for the workspace', () => {
  assert.match(service, /private invalidateTenantTokens\(tenantId: string\)/);
  assert.equal((service.match(/this.invalidateTenantTokens\(tenantId\)/g) ?? []).length, 2);
});

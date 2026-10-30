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
  assert.ok(access.includes('cacheKey = `${tenantId}:${userId}:${resource}`'));
  assert.ok(access.includes('hit.credential === row.refresh_token'));
  assert.match(access, /const credential = tok\.refreshToken \? seal\(tok\.refreshToken\) : row\.refresh_token;/);
  assert.ok(access.includes('SET refresh_token = ${credential}'));
  assert.ok(access.includes('this.tokens.set(cacheKey, { accessToken: tok.accessToken, expiresAt: tok.expiresAt, credential })'));
});

test('token rotation and error updates cannot overwrite a different consenting user', () => {
  assert.ok(access.includes('WHERE provider = ${PROVIDER} AND connected_by = ${userId}'));
  assert.ok(access.includes('AND refresh_token = ${row.refresh_token}'));
  assert.match(access, /RETURNING id/);
  assert.match(access, /if \(!updated.length\)/);
});

test('reconnect and disconnect clear every user-scoped token for the workspace', () => {
  assert.match(service, /private invalidateTenantTokens\(tenantId: string\)/);
  assert.equal((service.match(/this.invalidateTenantTokens\(tenantId\)/g) ?? []).length, 2);
});

const complete = service.slice(service.indexOf('async completeConnect('), service.indexOf('async disconnect('));
const disconnect = service.slice(service.indexOf('async disconnect('), service.indexOf('private async accessToken('));
const location = service.slice(service.indexOf('async chooseLocation('), service.indexOf('private async folder('));
const connection = service.slice(service.indexOf('private async connection('), service.indexOf('async upload('));

test('OAuth callback cannot replace another consenting user or mark their connection as failed', () => {
  assert.match(complete, /WHERE integration_connections\.connected_by = EXCLUDED\.connected_by/);
  assert.match(complete, /RETURNING id`\)\)/);
  assert.match(complete, /if \(!saved\)/);
  assert.match(complete, /WHERE provider = \$\{PROVIDER\} AND connected_by = \$\{st\.user_id\}/);
});

test('only the owner can disconnect a delegated connection; legacy unowned cleanup remains possible', () => {
  assert.match(disconnect, /connected_by = \$\{userId\} OR connected_by IS NULL/);
  assert.match(disconnect, /requireCapability\('pmoa_admin'\)/);
});

test('Graph folder selection and storage reads cannot cross the consenting user boundary', () => {
  assert.match(location, /WHERE provider = \$\{PROVIDER\} AND connected_by = \$\{userId\} RETURNING id/);
  assert.match(connection, /WHERE provider = \$\{PROVIDER\} AND connected_by = \$\{userId\}/);
});

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

test('reconnect, disconnect and revoked credentials clear every resource token for the workspace', () => {
  assert.match(service, /private invalidateTenantTokens\(tenantId: string\)/);
  const callback = service.slice(service.indexOf('async completeConnect('), service.indexOf('async disconnect('));
  const disconnect = service.slice(service.indexOf('async disconnect('), service.indexOf('private async accessToken('));
  assert.match(callback, /this.invalidateTenantTokens\(tenantId\)/);
  assert.match(disconnect, /this.invalidateTenantTokens\(tenantId\)/);
  assert.match(access, /if \(!isActiveDelegatedMicrosoftConnection\(row.status\)\) \{\s*this.invalidateTenantTokens\(tenantId\)/);
  assert.match(access, /this.invalidateTenantTokens\(tenantId\);\s*const msg = 'Microsoft credentials/);
});

const complete = service.slice(service.indexOf('async completeConnect('), service.indexOf('async disconnect('));
const disconnect = service.slice(service.indexOf('async disconnect('), service.indexOf('private async accessToken('));
const location = service.slice(service.indexOf('async chooseLocation('), service.indexOf('private async folder('));
const connection = service.slice(service.indexOf('private async connection('), service.indexOf('async upload('));

test('OAuth callback cannot replace another consenting user or mark their connection as failed', () => {
  assert.match(complete, /WHERE integration_connections\.connected_by = EXCLUDED\.connected_by/);
  assert.match(complete, /RETURNING id`\)\)/);
  assert.match(complete, /if \(!saved\)/);
  const failedExchange = complete.slice(complete.indexOf('tok = await exchangeCode('),
    complete.indexOf('if (!tok.refreshToken)'));
  assert.ok(failedExchange.length > 0);
  assert.doesNotMatch(failedExchange, /UPDATE integration_connections|status\s*=\s*'error'/);
});

test('only the owner can disconnect a delegated connection; legacy unowned cleanup remains possible', () => {
  assert.match(disconnect, /connected_by = \$\{userId\} OR connected_by IS NULL/);
  assert.match(disconnect, /requireCapability\('pmoa_admin'\)/);
});

test('Graph folder selection and storage reads cannot cross the consenting user boundary', () => {
  assert.match(location, /WHERE provider = \$\{PROVIDER\} AND connected_by = \$\{userId\}\s+AND status = 'connected' RETURNING id/);
  assert.match(connection, /WHERE provider = \$\{PROVIDER\} AND connected_by = \$\{userId\}\s+AND status = 'connected'/);
});

const e04aSql = readFileSync(new URL('../packages/db/migrations/0020_microsoft_user_connections.sql', import.meta.url), 'utf8');
const e04aSchema = readFileSync(new URL('../packages/db/src/schema.ts', import.meta.url), 'utf8');
const e04aJournal = JSON.parse(readFileSync(new URL('../packages/db/migrations/meta/_journal.json', import.meta.url), 'utf8'));
test('E04a user-bound storage is additive and fail-closed', () => {
 assert.match(e04aSql, /UNIQUE\(tenant_id,user_id,provider\)/);
 assert.match(e04aSql, /FOREIGN KEY\(tenant_id,user_id\)/);
 assert.match(e04aSql, /ENABLE ROW LEVEL SECURITY/);
 assert.match(e04aSql, /FORCE ROW LEVEL SECURITY/);
 assert.match(e04aSql, /REVOKE ALL ON TABLE public\.microsoft_user_connections FROM PUBLIC/);
 assert.doesNotMatch(e04aSql, /(?:DROP|TRUNCATE|DELETE FROM)\s+(?:public\.)?integration_connections/i);
 assert.match(e04aSchema, /export const microsoftUserConnections = pgTable/);
 assert.equal(e04aJournal.entries.find(entry => entry.idx === 20)?.tag, '0020_microsoft_user_connections');
});


test('location selection never resets a revoked Microsoft connection to connected', () => {
  const update = location.slice(location.indexOf('UPDATE integration_connections SET'),
    location.indexOf('WHERE provider = ${PROVIDER}', location.indexOf('UPDATE integration_connections SET')));
  assert.ok(update.length > 0);
  assert.doesNotMatch(update, /status\s*=\s*'connected'/);
  assert.doesNotMatch(update, /last_error\s*=\s*NULL/);
});

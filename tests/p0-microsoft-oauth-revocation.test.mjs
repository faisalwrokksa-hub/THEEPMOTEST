import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../apps/api/src/microsoft/microsoft.service.ts', import.meta.url), 'utf8');
const start = source.slice(source.indexOf('async beginConnect('), source.indexOf('async completeConnect('));
const callback = source.slice(source.indexOf('async completeConnect('), source.indexOf('async disconnect('));

test('OAuth start binds a single-use state to the initiating administrator', () => {
  assert.match(start, /requireCapability\('pmoa_admin'\)/);
  assert.match(start, /INSERT INTO oauth_states/);
  assert.match(start, /\$\{userId\}/);
  assert.match(callback, /DELETE FROM oauth_states/);
  assert.match(callback, /RETURNING tenant_id, provider, user_id, return_to/);
});

test('OAuth completion rechecks active administrator membership before storing tokens', () => {
  const guard = callback.indexOf('FROM memberships AS m');
  const write = callback.indexOf('INSERT INTO integration_connections');
  assert.ok(guard >= 0 && write > guard, 'membership guard must precede credential write');
  assert.match(callback, /m\.tenant_id = \$\{tenantId\}/);
  assert.match(callback, /m\.user_id = \$\{st\.user_id\}/);
  assert.match(callback, /m\.is_active = true/);
  assert.match(callback, /m\.role IN \('owner', 'admin', 'client_admin'\)/);
  assert.match(callback, /FOR SHARE OF m/);
  assert.match(callback, /if \(!authorized\)/);
  assert.match(callback, /throw new ForbiddenException/);
});

test('membership validation and token upsert share one tenant-scoped transaction', () => {
  const transaction = callback.indexOf('await withTenant(tenantId, async (tx) => {', callback.indexOf('const who = readIdToken('));
  const guard = callback.indexOf('FROM memberships AS m');
  const upsert = callback.indexOf('INSERT INTO integration_connections');
  const audit = callback.indexOf("action: 'microsoft.connected'");
  assert.ok(transaction >= 0 && guard > transaction && upsert > guard && audit > upsert);
  assert.match(callback, /WHERE integration_connections\.connected_by = EXCLUDED\.connected_by/);
});

test('public Microsoft callback rejects cross-deployment state before database or token exchange', () => {
  assert.match(source, /import \{ deploymentAllowsTenant, parseRuntimeDeployment \} from '\.\.\/tenancy\/deployment-runtime';/);
  assert.match(source, /private readonly runtimeDeployment = parseRuntimeDeployment\(process\.env\);/);
  const validation = callback.indexOf('if (!deploymentAllowsTenant(this.runtimeDeployment, tenantId))');
  const tenantDb = callback.indexOf('const st = await withTenant(tenantId');
  const tokenExchange = callback.indexOf('await exchangeCode(cfg, code, resource)');
  assert.ok(validation >= 0 && tenantDb > validation && tokenExchange > tenantDb,
    'reject off-deployment state before tenant DB access and Microsoft token exchange');
  const denied = callback.slice(validation, tenantDb);
  assert.match(denied, /throw new BadRequestException\(/);
  assert.match(denied, /That sign-in link has expired or has already been used/);
});

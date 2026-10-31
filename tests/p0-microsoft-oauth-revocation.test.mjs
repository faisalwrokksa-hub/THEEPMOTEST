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
  // Preview mode has an earlier, separate owner-scoped audit transaction.
  // Locate the legacy transaction relative to its own membership guard.
  const guard = callback.indexOf('FROM memberships AS m');
  const transaction = callback.lastIndexOf('await withTenant(tenantId, async (tx) => {', guard);
  const upsert = callback.indexOf('INSERT INTO integration_connections', guard);
  const audit = callback.indexOf("action: 'microsoft.connected'", upsert);
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

test('preview callback persists only the state owner using DAO membership locking', () => {
  const store = readFileSync(new URL('../apps/api/src/microsoft/user-connection-store.ts', import.meta.url), 'utf8');
  assert.match(callback, /if \(this\.perUserPreview\(\)\)/);
  assert.match(callback, /saveUserMicrosoftConsent\(tenantId, st\.user_id,/);
  assert.match(store, /m\.role IN \('owner', 'admin', 'client_admin'\)/);
  assert.match(store, /FOR SHARE OF m, u/);
  assert.match(store, /ON CONFLICT \(tenant_id, user_id, provider\)/);
});

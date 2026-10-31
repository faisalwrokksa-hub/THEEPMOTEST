import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assertMicrosoftUserIdentity, microsoftUserStorePreviewEnabled } from '../apps/api/src/microsoft/user-connection-policy.ts';
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const migration = read('../packages/db/migrations/0022_microsoft_user_owner_rls.sql');
const store = read('../apps/api/src/microsoft/user-connection-store.ts');
const rls = read('../packages/db/sql/rls.sql');

test('per-user storage is off by default; malformed identities are rejected', () => {
  assert.equal(microsoftUserStorePreviewEnabled({}), false);
  assert.equal(microsoftUserStorePreviewEnabled({ MS_USER_CONNECTIONS_STORE_PREVIEW: 'true' }), false);
  assert.equal(microsoftUserStorePreviewEnabled({ MS_USER_CONNECTIONS_STORE_PREVIEW: 'enabled' }), true);
  const t = '11111111-1111-1111-1111-111111111111';
  const u = '22222222-2222-2222-2222-222222222222';
  assert.doesNotThrow(() => assertMicrosoftUserIdentity(t, u));
  for (const [tenant, user] of [['', u], [t, ''], ['other', u], [t, 'owner-a'], [t, t + 'x']])
    assert.throws(() => assertMicrosoftUserIdentity(tenant, user), /valid tenant and consenting user/);
});

test('restrictive PostgreSQL policy requires tenant, owner and active admin membership', () => {
  assert.match(migration, /CREATE POLICY microsoft_user_owner ON public\.microsoft_user_connections\s+AS RESTRICTIVE FOR ALL/);
  const [using, checking] = migration.split(/\bWITH CHECK\s*\(/);
  for (const clause of [using, checking]) {
    assert.match(clause, /current_setting\('app\.tenant_id', true\)/);
    assert.match(clause, /current_setting\('app\.user_id', true\)/);
    assert.match(clause, /m\.tenant_id = microsoft_user_connections\.tenant_id/);
    assert.match(clause, /m\.user_id = microsoft_user_connections\.user_id/);
    assert.match(clause, /m\.is_active = true/);
    assert.match(clause, /'owner', 'admin', 'client_admin'/);
  }
  assert.match(rls, /DROP POLICY IF EXISTS tenant_isolation ON %I/);
  assert.doesNotMatch(migration, /(?:DROP TABLE|TRUNCATE|DELETE FROM)\s+(?:public\.)?integration_connections/i);
  assert.doesNotMatch(migration, /GRANT\s+ALL|AS PERMISSIVE/i);
});

test('all DAO operations use transaction-local identity and owner-scoped predicates', () => {
  assert.match(store, /if \(!microsoftUserStorePreviewEnabled\(\)\)/);
  assert.match(store, /assertMicrosoftUserIdentity\(tenantId, userId\)/);
  assert.match(store, /withTenant\(tenantId, async \(tx\) => \{/);
  assert.match(store, /set_config\('app\.user_id', \$\{userId\}, true\)/);
  assert.equal((store.match(/return withOwner\(tenantId, userId, async \(tx\) =>/g) ?? []).length, 6);
  assert.equal((store.match(/WHERE tenant_id = \$\{tenantId\} AND user_id = \$\{userId\}/g) ?? []).length, 5);
  assert.match(store, /ON CONFLICT \(tenant_id, user_id, provider\)/);
  assert.match(store, /AND status = 'connected'\s+AND refresh_token = \$\{expectedSealedToken\}/);
  assert.match(store, /SET status = 'error', refresh_token = NULL/);
  assert.match(store, /AND refresh_token IS NOT NULL\s+RETURNING id/);
});

test('consent is sealed, CAS protected and does not modify legacy tokens', () => {
  assert.match(store, /const sealed = seal\(consent\.refreshToken\)/);
  assert.match(store, /newRefreshToken \? seal\(newRefreshToken\)/);
  assert.doesNotMatch(store, /(?:INSERT INTO|UPDATE|DELETE FROM)\s+integration_connections/);
  assert.doesNotMatch(store, /console\.(?:log|error)|\.log\(/);
  assert.match(store, /FOR SHARE OF m, u/);
});

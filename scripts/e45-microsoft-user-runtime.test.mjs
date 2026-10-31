import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const service = readFileSync(new URL('../apps/api/src/microsoft/microsoft.service.ts', import.meta.url), 'utf8');
const store = readFileSync(new URL('../apps/api/src/microsoft/user-connection-store.ts', import.meta.url), 'utf8');

test('preview is off by default and legacy branch remains intact', () => {
  assert.match(service, /microsoftUserStorePreviewEnabled\(\)/);
  assert.match(service, /FROM integration_connections WHERE provider = \$\{PROVIDER\}/);
  assert.match(service, /ON CONFLICT \(tenant_id, provider\)/);
});
test('callback binds consent to single-use state owner, never callback cookie', () => {
  assert.match(service, /DELETE FROM oauth_states[\s\S]*RETURNING tenant_id, provider, user_id, return_to/);
  assert.match(service, /saveUserMicrosoftConsent\(tenantId, st\.user_id,/);
  assert.doesNotMatch(service, /saveUserMicrosoftConsent\(tenantId, this\.ctx\(\)\.userId/);
});
test('owner-specific status, disconnect and Graph refresh use scoped DAO', () => {
  for (const name of ['readUserMicrosoftConnection', 'deleteUserMicrosoftConnection',
    'rotateUserMicrosoftCredential', 'markUserMicrosoftCredentialRevoked']) {
    assert.match(service, new RegExp(name + '\\('));
    assert.match(store, new RegExp('export async function ' + name + '\\('));
  }
  assert.match(service, /hit\.credential === row\.sealedRefreshToken/);
  assert.match(service, /if \(!credential\)[\s\S]*Microsoft connection changed during refresh/);
});
test('folder and upload finalization recheck owner and location under row lock', () => {
  assert.match(service, /setUserMicrosoftLocation\(tenantId, userId/);
  assert.match(service, /SELECT drive_id, root_item_id, root_path, site_url FROM microsoft_user_connections/);
  assert.match(service, /SELECT id FROM microsoft_user_connections[\s\S]*AND refresh_token IS NOT NULL AND drive_id = \$\{c\.drive_id\}[\s\S]*FOR SHARE/);
  assert.match(service, /set_config\('app\.user_id', \$\{userId\}, true\)/);
});

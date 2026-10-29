import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { redactMicrosoftConnection } from '../apps/api/src/microsoft/connection-policy.ts';
const read = f => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const service = read('apps/api/src/microsoft/microsoft.service.ts');
const controller = read('apps/api/src/microsoft/microsoft.controller.ts');
const page = read('apps/web/src/app/(app)/power-bi/page.tsx');
const nav = read('apps/web/src/lib/nav.ts');
const panel = read('apps/web/src/components/MicrosoftPanel.tsx');
const component = read('apps/web/src/components/PowerBiReport.tsx');
const docs = read('docs/microsoft-setup.md');
const insights = read('apps/api/src/modules/insights.service.ts');
const connection = { id: 'secret-id', status: 'connected', accountEmail: 'admin@example.test',
  accountName: 'Admin User', externalTenantId: 'tenant-external', scopes: 'Report.Read.All',
  siteId: 'privateSite', siteName: 'Finance', siteUrl: 'https://example.test/site',
  driveId: 'drive', driveName: 'Confidential', rootItemId: 'root', rootPath: 'finance',
  connectedAt: '2026-01-01T00:00:00.000Z', lastError: 'provider token: secret' };

function bodyBetween(start, end) {
  const a = service.indexOf(start); const b = service.indexOf(end, a);
  assert.ok(a >= 0 && b > a, `Missing ${start}`);
  return service.slice(a,b);
}

test('non-admin Microsoft connection status contains only safe summary', () => {
  const safe = redactMicrosoftConnection(connection, false);
  assert.equal(safe.status, 'connected');
  assert.equal(safe.connectedAt, connection.connectedAt);
  for (const key of ['accountEmail','accountName','externalTenantId','scopes',
    'siteId','siteName','siteUrl','driveId','driveName','rootItemId','rootPath','lastError']) {
    assert.equal(safe[key], null, `${key} leaked`);
  }
  assert.equal(safe.id, '');
});
test('workspace administrators retain full connection metadata', () => {
  assert.deepEqual(redactMicrosoftConnection(connection,true),connection);
});
test('service status reads authenticated capabilities before returning metadata', () => {
  const code = bodyBetween('async status()', 'async beginConnect(');
  assert.match(code,/redactMicrosoftConnection\(/);
  assert.match(code,/can\(this\.ctx\(\)\.capabilities \?\? \[\], 'pmoa_admin'\)/);
});
test('Power BI report listing checks admin permission BEFORE getting shared Microsoft token', () => {
  const code = bodyBetween('async reports()', 'async embed(');
  const guard = code.indexOf("requireCapability('pmoa_admin')");
  const token = code.indexOf("await this.accessToken('powerbi')");
  assert.ok(guard >= 0 && token > guard);
});
test('Power BI embed checks admin permission BEFORE fetching transferable bearer token', () => {
  const code = service.slice(service.indexOf('async embed('));
  assert.ok(code.indexOf("requireCapability('pmoa_admin')") >= 0);
  assert.ok(code.indexOf("requireCapability('pmoa_admin')") < code.indexOf("await this.accessToken('powerbi')"));
  assert.match(code,/accessToken: token/);
});
test('API cannot rely on UI for provider authorization', () => {
  assert.match(controller, /@Get\('reports'\)/);
  assert.match(controller, /@Get\('reports\/:id\/embed'\)/);
  assert.match(service,/requireCapability\('pmoa_admin'\)/);
});
test('Power BI SSR page independently rejects non-admin users', () => {
  assert.match(page, /getSession\(\)/);
  assert.match(page, /!session\.authenticated \|\| !session\.capabilities\.includes\('pmoa_admin'\)/);
  assert.ok(page.indexOf('redirect(\'/\')') < page.indexOf('<PowerBiReport'));
});
test('navigation requires admin capability for Power BI', () => {
  assert.match(nav, /href: '\/power-bi', cap: 'pmoa_admin'/);
});
test('Microsoft panel conceals configuration details from non-admins', () => {
  assert.match(panel, /\{mayManage && <dl>/);
  assert.match(panel, /Only workspace administrators can view Microsoft connection details/);
});
test('provider integration error messages are omitted for non-admins', () => {
  const f = insights.slice(insights.indexOf('async integrations()'), insights.indexOf('async settings()'));
  assert.match(f, /CASE WHEN \$\{can\(this\.ctx\(\)\.capabilities \?\? \[\], 'pmoa_admin'\)\}/);
  assert.match(f, /THEN last_error ELSE NULL::text END/);
});
test('documentation makes shared-token restrictions explicit', () => {
  assert.match(docs, /Power BI currently uses the Microsoft account connected to the workspace/);
  assert.match(docs, /restricted to EPMO workspace administrators/);
  assert.doesNotMatch(docs, /signed-in person's own\*\* token/);
});
test('client documentation does not falsely advertise per-user Power BI tokens', () => {
  assert.match(component, /shared workspace-connected Microsoft account/);
  assert.doesNotMatch(component, /This is the user-owns-data pattern/);
  assert.doesNotMatch(page, /Signed in as them, so what each person can see/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const load = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const ctrl = load('apps/api/src/modules/insights.controller.ts');
const svc = load('apps/api/src/modules/trends.service.ts');
const access = load('packages/contracts/src/access.ts');
const nav = load('apps/web/src/lib/nav.ts');
const liveTrends = load('tests/trends.test.ts');
const liveModules = load('tests/modules.test.ts');

function bodyBetween(text, start, end) {
  const a = text.indexOf(start);
  assert.ok(a >= 0, `missing ${start}`);
  const b = text.indexOf(end,a + start.length);
  assert.ok(b > a, `missing delimiter ${end}`);
  return text.slice(a,b);
}

test('manual trends capture uses the authenticated tenant, never full-tenant capture', () => {
  const method = bodyBetween(ctrl, 'async capture() {', "@Get('my-work')");
  assert.match(method, /requireCapability\('pmoa_admin'\)/);
  assert.match(method, /captureTenant\(currentContext\(\)\.tenantId\)/);
  assert.doesNotMatch(method, /trends_\.capture\(\)/);
  assert.match(method, /workspaces: 1/);
});
test('tenant snapshot writes occur under withTenant with that tenant ID', () => {
  const method = bodyBetween(svc, 'async captureTenant(tenantId: string)', '/** System-only maintenance');
  assert.match(method, /withTenant\(tenantId, async \(tx\) =>/);
  assert.match(method, /INSERT INTO portfolio_snapshots/);
  assert.match(method, /SELECT \$\{tenantId\}, current_date/);
  assert.doesNotMatch(method, /SELECT id FROM tenants|db\.execute/);
});
test('global snapshot capture is system-only and calls tenant-scoped implementation', () => {
  const method = bodyBetween(svc, 'async capture(): Promise<number>', '/** Just after midnight');
  assert.match(method, /SELECT id FROM tenants/);
  assert.match(method, /await this\.captureTenant\(t\.id\)/);
});
test('startup and scheduler retain system-wide snapshot behavior', () => {
  assert.match(svc, /onModuleInit\(\)[\s\S]*?await this\.capture\(\)/);
  assert.match(svc, /async nightly\(\)[\s\S]*?await this\.capture\(\)/);
});
test('detailed finance data requires both its module and the viewing capability', () => {
  const body = bodyBetween(ctrl, "@RequiresModule('finance360')", "@RequiresModule('benefits360')");
  assert.match(body, /requireCapability\('pmoa_view_financials'\)/);
  assert.ok(body.indexOf("requireCapability('pmoa_view_financials')") < body.indexOf('this.svc.financials()'));
});
test('benefit details require viewing capability in addition to module license', () => {
  const body = bodyBetween(ctrl, "@RequiresModule('benefits360')", "@RequiresModule('hr360')");
  assert.match(body, /requireCapability\('pmoa_view_financials'\)/);
  assert.ok(body.indexOf("requireCapability('pmoa_view_financials')") < body.indexOf('this.svc.benefits()'));
});
test('finance and benefits navigation already require financial-view access', () => {
  assert.match(nav, /href: '\/financials', cap: 'pmoa_view_financials'/);
  assert.match(nav, /href: '\/benefits', cap: 'pmoa_view_financials'/);
});
test('workspace read-only staff role does not inherit financial-view capability', () => {
  assert.match(access, /team_member:\s*\['read','pmoa_manage_work','pmoa_post_updates'\]/);
  assert.match(access, /finance_benefits:\s*\[[^\]]*'pmoa_view_financials'/);
});
test('integration tests assert single-tenant capture and non-admin denial', () => {
  assert.match(liveTrends, /workspaces\)\.toBe\(1\)/);
  assert.match(liveTrends, /does not allow a non-admin to capture/);
});
test('integration tests assert both denied and allowed financial reads', () => {
  assert.match(liveModules, /denies detailed financial and benefits data/);
  assert.match(liveModules, /allows a member explicitly assigned finance viewing permissions/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const get = (file) => readFileSync(new URL('../' + file, import.meta.url), 'utf8');
const access = get('packages/contracts/src/access.ts');
const svc = get('apps/api/src/creates/creates.service.ts');
const ctrl = get('apps/api/src/creates/creates.controller.ts');
const page = get('apps/web/src/app/(app)/updates/page.tsx');
const insights = get('apps/api/src/modules/insights.controller.ts');
const ci = get('.github/workflows/ci.yml');
const settings = get('apps/web/src/app/(app)/settings/page.tsx');
const roleCaps = (role) => {
  const match = access.match(new RegExp(`^\\s*${role}: \\[([^\\n]*)\\],`, 'm'));
  assert.ok(match, `Missing role ${role}`);
  return [...match[1].matchAll(/'([^']+)'/g)].map(m => m[1]);
};
test('posting is an explicit capability, not implicit read access', () => {
  assert.match(access, /'pmoa_post_updates'/);
  const body = svc.split('async update(b: any) {')[1].split('\n  }')[0];
  assert.match(body, /requireCapability\('pmoa_post_updates'\)/);
  assert.doesNotMatch(body, /requireCapability\('read'\)/);
});
test('read-only roles cannot publish new updates', () => {
  for (const role of ['executive_viewer', 'viewer', 'restricted_viewer']) {
    assert.ok(roleCaps(role).includes('read'));
    assert.ok(!roleCaps(role).includes('pmoa_post_updates'), role);
  }
});
test('project, governance and finance personnel can publish updates', () => {
  for (const role of ['pmo_lead', 'portfolio_manager', 'program_manager',
    'project_manager', 'governance_risk', 'finance_benefits'])
    assert.ok(roleCaps(role).includes('pmoa_post_updates'), role);
});
test('contributors and external professionals retain collaboration access', () => {
  for (const role of ['staff_consultant', 'external_professional', 'team_member', 'contributor'])
    assert.ok(roleCaps(role).includes('pmoa_post_updates'), role);
});
test('workspace owners and administrators receive the posting capability', () => {
  assert.match(access, /const ALL:[\s\S]*?'pmoa_post_updates'[\s\S]*?export const ROLE_CAPABILITIES/);
  for (const role of ['owner', 'admin', 'client_admin'])
    assert.match(access, new RegExp(`^\\s*${role}: ALL,`, 'm'));
});
test('updates remain readable without posting privilege', () => {
  assert.match(insights, /@Get\('updates'\)\s+updates\(\)/);
  assert.match(page, /<Loaded load=\{api\.updates\}/);
});
test('UI shows the editor only to posting-capable sessions', () => {
  assert.match(page, /const mayPost = session\.authenticated && can\(session\.capabilities as Capability\[\], 'pmoa_post_updates'\)/);
  assert.match(page, /\{mayPost \? <NewRecord/);
  assert.match(page, /posting requires contributor permission/);
});
test('API validates the update payload and still owns write authorization', () => {
  assert.match(ctrl, /@Post\('update'\)\s+update\(@Body\(new ZodPipe\(createUpdateIn\)\)/);
  assert.match(svc, /await this\.mustOwnProject\(tx, b\.projectId\)/);
});
test('live DB authorization test cannot be silently skipped by CI', () => {
  assert.match(ci, /Live update-feed viewer and contributor authorization/);
  assert.match(ci, /P0_UPDATES_LIVE_ACCEPTANCE: 'true'/);
  assert.match(ci, /tests\/update-write-authorization\.test\.ts/);
});

test('workspace settings explains the new posting permission', () => {
  assert.match(settings, /pmoa_post_updates: 'Post updates and escalations/);
});

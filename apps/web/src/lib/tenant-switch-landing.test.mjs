import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { tenantSwitchLandingPath } from './tenant-switch-landing.mjs';

const route = readFileSync(new URL('../app/api/session/tenant/route.ts', import.meta.url), 'utf8');

test('workspace switch retains safe shared pages without stale filters', () => {
  for (const path of ['/', '/projects', '/programs', '/portfolios', '/settings', '/billing', '/getting-started', '/reports', '/analytics', '/my-work']) {
    assert.equal(tenantSwitchLandingPath(path), path);
  }
  assert.equal(tenantSwitchLandingPath('/projects?programId=old-tenant-id'), '/projects');
  assert.equal(tenantSwitchLandingPath('/settings?error=old-error#invite'), '/settings');
});

test('workspace switch does not replay old tenant entity links or unsafe paths', () => {
  for (const path of [
    '/projects/00000000-0000-4000-8000-000000000001',
    '/programs/00000000-0000-4000-8000-000000000001',
    '/portfolios/old-id', '/projects/create', '/api/session/logout',
    '//evil.example/path', '/\\evil.example', '/projects/../billing',
    '/%70rojects', '/projects%2Fsecret', 'https://evil.example',
    '', null, undefined, '/projects\nSet-Cookie: bad=1',
  ]) assert.equal(tenantSwitchLandingPath(path), '/', String(path));
});

test('workspace switch route uses the safe landing policy after authenticated mutation', () => {
  assert.match(route, /tenantSwitchLandingPath\(to === safeTo \? safeTo : '\/'\)/);
  assert.match(route, /safeReturnPath\(to, '\/'\)/);
  assert.match(route, /if \(!response\?\.ok\)/);
  assert.match(route, /fetchTenantMutation\(fetch,/);
});

import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
const source = readFileSync(new URL('../apps/api/src/platform/platform.service.ts', import.meta.url), 'utf8');
test('module catalogue is subscription gated', () => {
  const list = source.slice(source.indexOf('async list()'), source.indexOf('async enabledIds()'));
  assert.match(list, /EXISTS\s*\(\s*SELECT 1 FROM tenant_subscriptions/);
  assert.match(list, /sub\.tenant_id = \$\{tenantId\}/);
  assert.match(list, /sub\.period_ends_at > now\(\)/);
  assert.match(list, /sub\.trial_ends_at > now\(\)/);
  assert.match(list, /tm\.expires_at IS NULL OR tm\.expires_at > now\(\)/);
});
test('core module remains accessible', () => assert.match(source, /CASE WHEN m\.is_core THEN true/));
test('module enabled endpoint also validates subscription', () => {
  const enabled = source.slice(source.indexOf('async enabledIds()'), source.indexOf('async setModule('));
  assert.match(enabled, /tenant_subscriptions/);
  assert.match(enabled, /s\.period_ends_at > now\(\)/);
});

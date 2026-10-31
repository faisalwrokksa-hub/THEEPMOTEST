import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { tenantSwitchFailurePath, tenantSwitchFeedback } from './tenant-switch-feedback.mjs';

test('expired session returns to sign-in, never a misleading workspace success', () => {
  assert.equal(tenantSwitchFailurePath(401), '/login?error=expired');
});

test('failed tenant mutations use fixed redirect status codes', () => {
  for (const [status, code] of [[403, 'forbidden'], [429, 'rate_limited'],
    [503, 'unavailable'], [502, 'unavailable'], [504, 'unavailable'],
    [400, 'failed'], [409, 'failed'], [null, 'unavailable']]) {
    assert.equal(tenantSwitchFailurePath(status), `/settings?switch=${code}`);
  }
  for (const status of [undefined, NaN, Infinity, '503', -1]) {
    assert.match(tenantSwitchFailurePath(status), /^\/settings\?switch=(?:failed|unavailable)$/);
  }
});

test('workspace failure feedback is safe, bilingual and bounded', () => {
  for (const code of ['forbidden', 'rate_limited', 'unavailable', 'failed']) {
    const en = tenantSwitchFeedback(code, 'en');
    const ar = tenantSwitchFeedback(code, 'ar');
    assert.match(en, /Workspace/);
    assert.match(ar, /مساحة العمل/);
    assert.ok(en.length < 180 && ar.length < 180);
  }
  for (const code of [null, undefined, '', 'error=secret', '<script>',
    '__proto__', 'constructor', ['failed'], 'service\nSet-Cookie: x']) {
    assert.equal(tenantSwitchFeedback(code, 'en'), null);
  }
});

test('route and settings page wire fixed failures to accessible feedback', () => {
  const routePath = new URL('../app/api/session/tenant/route.ts', import.meta.url);
  const settingsPath = new URL('../app/(app)/settings/page.tsx', import.meta.url);
  if (!existsSync(routePath.pathname) || !existsSync(settingsPath.pathname)) return;
  const route = readFileSync(routePath, 'utf8');
  const settings = readFileSync(settingsPath, 'utf8');
  assert.match(route, /tenantSwitchFailurePath\(response\?\.status\)/);
  assert.match(route, /NextResponse\.redirect\(publicUrl\(req, tenantSwitchFailurePath/);
  assert.match(settings, /tenantSwitchFeedback\(switchStatus, lang\)/);
  assert.match(settings, /switchMessage && <p[^>]*role="alert"/);
  assert.doesNotMatch(settings, /\{switchStatus\}/);
});

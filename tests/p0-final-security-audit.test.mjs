import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { safeMicrosoftReturnPath } from '../apps/api/src/microsoft/return-path.ts';

const read = (name) => readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
const notify = read('apps/api/src/notify/notify.controller.ts');
const nav = read('apps/web/src/lib/nav.ts');
const msController = read('apps/api/src/microsoft/microsoft.controller.ts');
const msService = read('apps/api/src/microsoft/microsoft.service.ts');
const listBody = notify.split('async list(')[1].split("@Post('run')")[0];

test('notification outbox is restricted to administrators, not any workspace reader', () => {
  assert.match(listBody, /requireCapability\('pmoa_admin'\)/);
  assert.ok(listBody.indexOf("requireCapability('pmoa_admin')") < listBody.indexOf('withTenant('));
});
test('notification navigation advertises the same capability as API', () => {
  assert.match(nav, /href: '\/notifications', cap: 'pmoa_admin'/);
});
test('notification limits must be positive bounded safe integers', () => {
  assert.match(listBody, /Number\.isSafeInteger\(n\)/);
  assert.match(listBody, /n < 1 \|\| n > 500/);
  assert.match(listBody, /BadRequestException/);
});
test('valid OAuth return paths stay inside the integration settings page', () => {
  assert.equal(safeMicrosoftReturnPath('/integrations'), '/integrations');
  assert.equal(safeMicrosoftReturnPath('/integrations?section=files#help'), '/integrations?section=files#help');
});
for (const value of [
  '//evil.example/path', '/\\evil.example', 'https://evil.example',
  'javascript:alert(1)', '/projects', '/integrations/other',
  '/integrations\nHost:evil', '/integrations'.repeat(100), null, 5,
]) {
  test(`OAuth return path rejects unapproved value ${String(value).slice(0, 45)}`, () => {
    assert.equal(safeMicrosoftReturnPath(value), '/integrations');
  });
}
test('OAuth callback revalidates stored redirect before sending Location header', () => {
  assert.match(msController, /new URL\(safeMicrosoftReturnPath\(returnTo\), web\)/);
});
test('OAuth initiation stores a validated redirect, not the caller-provided string', () => {
  assert.match(msService, /\$\{safeMicrosoftReturnPath\(returnTo\)\}/);
});

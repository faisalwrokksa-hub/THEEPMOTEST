import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = p => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const service = read('apps/api/src/auth/auth.service.ts');
const controller = read('apps/api/src/auth/auth.controller.ts');
const single = read('apps/web/src/app/api/session/logout/route.ts');
const all = read('apps/web/src/app/api/session/logout-all/route.ts');
const recovery = read('apps/web/src/lib/logout-recovery.ts');
const switcher = read('apps/web/src/components/TenantSwitcher.tsx');
const dictionary = read('packages/contracts/src/i18n.ts');
const accountWide = service.split('async logoutEverywhere(')[1].split('async pruneSessions(')[0];

test('revocation authenticates the current cookie rather than a request-supplied user id', () => {
  assert.match(accountWide, /const principal = await this\.principal\(token\)/);
  assert.match(accountWide, /if \(!principal\) throw new UnauthorizedException/);
  assert.doesNotMatch(accountWide, /req\.body|body\.userId/);
});
test('revocation deletes every session for the global user, not only the active tenant', () => {
  assert.match(accountWide, /tx\.delete\(sessions\)[\s\S]*?\.where\(eq\(sessions\.userId, principal\.userId\)\)/);
  assert.doesNotMatch(accountWide, /eq\(sessions\.activeTenantId/);
});
test('audit is committed in the same transaction as session deletion', () => {
  assert.match(accountWide, /return db\.transaction\(async \(tx\) =>/);
  assert.match(accountWide, /await tx\.delete\(sessions\)/);
  assert.match(accountWide, /await tx\.insert\(authEvents\)/);
  assert.match(accountWide, /action: 'logout\.all'/);
});
test('API removes the browser cookie only after server-side revocation succeeds', () => {
  const route = controller.split("@Post('logout-all')")[1].split("@Get('session')")[0];
  assert.ok(route.indexOf('await this.auth.logoutEverywhere') < route.indexOf('res.clearCookie'));
  assert.match(route, /req\.cookies\?\.\[SESSION_COOKIE\]/);
});
test('ordinary browser logout does not hide backend failures', () => {
  assert.doesNotMatch(single, /\.catch\(\(\) => \{\}\)/);
  assert.match(single, /if \(!result\?\.ok\) throw/);
  assert.match(single, /fetchTenantMutation\(fetch,/);
  assert.match(single, /catch \{[\s\S]*?return logoutFailureResponse\(req, false\)/);
  assert.match(recovery, /status: 503/);
  assert.ok(single.indexOf('if (!result?.ok)') < single.indexOf('out.cookies.delete'));
});
test('browser logout-all requires trusted mutation provenance and a cookie', () => {
  assert.match(all, /rejectUnsafeBrowserMutation\(req\)/);
  assert.match(all, /if \(blocked\) return blocked/);
  assert.match(all, /req\.cookies\.get\(SESSION\)\?\.value/);
  assert.match(all, /if \(!token\) return/);
});
test('browser logout-all never claims success when the API is unavailable', () => {
  assert.match(all, /if \(!response\?\.ok\) throw/);
  assert.match(all, /fetchTenantMutation\(fetch,/);
  assert.match(all, /catch \{/);
  assert.match(all, /catch \{[\s\S]*?return logoutFailureResponse\(req, true\)/);
  assert.match(recovery, /status: 503/);
  assert.ok(all.indexOf('if (!response?.ok)') < all.indexOf('result.cookies.delete'));
});
test('account menu offers a form POST for all-device revocation', () => {
  assert.match(switcher, /<form method="post" action="\/api\/session\/logout-all">/);
  assert.match(switcher, /tx\('Sign out all devices'\)/);
});
test('new security action has explicit Arabic translations', () => {
  assert.match(dictionary, /'Sign out all devices': 'تسجيل الخروج من جميع الأجهزة'/);
  assert.match(dictionary, /'revoke every active session': 'إلغاء جميع الجلسات النشطة'/);
});
test('single and all-device session routes use safe no-store failure responses', () => {
  for (const source of [single, all]) {
    assert.match(source, /return logoutFailureResponse\(req,/);
    assert.match(source, /publicUrl\(req, '\/login'\)/);
  }
  assert.match(recovery, /'cache-control': 'no-store'/);
  assert.match(recovery, /'x-content-type-options': 'nosniff'/);
  assert.match(recovery, /status: 503/);
});

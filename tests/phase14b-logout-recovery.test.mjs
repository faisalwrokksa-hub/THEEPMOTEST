import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const helper = source('../apps/web/src/lib/logout-recovery.ts');
const single = source('../apps/web/src/app/api/session/logout/route.ts');
const all = source('../apps/web/src/app/api/session/logout-all/route.ts');

test('both native logout forms recover from a failed revocation without a raw JSON page', () => {
  assert.match(single, /catch \{[\s\S]*?return logoutFailureResponse\(req, false\);/);
  assert.match(all, /catch \{[\s\S]*?return logoutFailureResponse\(req, true\);/);
  assert.match(helper, /req\.headers\.get\('accept'\)\?\.includes\('text\/html'\)/);
  assert.match(helper, /new NextResponse\(html, \{/);
  assert.match(helper, /status: 503/);
});

test('failure response has accessible bilingual retry and workspace recovery', () => {
  assert.match(helper, /<html lang="\$\{ar \? 'ar' : 'en'\}" dir="\$\{ar \? 'rtl' : 'ltr'\}">/);
  assert.match(helper, /<meta name="viewport" content="width=device-width, initial-scale=1">/);
  assert.match(helper, /<h1>\$\{title\}<\/h1><p role="alert">\$\{detail\}<\/p>/);
  assert.match(helper, /<form method="post" action="\$\{action\}"><button type="submit">\$\{retry\}<\/button><\/form>/);
  assert.match(helper, /<a href="\/">\$\{back\}<\/a>/);
  assert.match(helper, /allDevices \? '\/api\/session\/logout-all' : '\/api\/session\/logout'/);
});

test('failure preserves the session; only confirmed success clears the cookie', () => {
  for (const route of [single, all]) {
    assert.match(route, /rejectUnsafeBrowserMutation\(req\)/);
    assert.match(route, /return logoutFailureResponse\(req,/);
    assert.match(route, /\.cookies\.delete\(SESSION\)/);
    assert.ok(route.indexOf('return logoutFailureResponse(req,') < route.indexOf('.cookies.delete(SESSION)'));
  }
  assert.doesNotMatch(helper, /\.cookies\.delete\(|SESSION_COOKIE|pmo_session/);
});

test('API clients retain structured 503 while browser responses cannot be cached', () => {
  assert.match(helper, /return NextResponse\.json\(\{ error:/);
  assert.match(helper, /'cache-control': 'no-store'/);
  assert.match(helper, /'x-content-type-options': 'nosniff'/);
  assert.match(helper, /'content-type': 'text\/html; charset=utf-8'/);
  assert.doesNotMatch(helper, /res\.json\(|body\?\.message/);
});

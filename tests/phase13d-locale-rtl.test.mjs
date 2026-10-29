import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compareTableValues, formatTableCount } from '../apps/web/src/lib/table-locale.mjs';

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

test('numerical sorting uses numeric values', () => {
  assert.ok(compareTableValues(2, 10, 'en', 'asc') < 0);
  assert.ok(compareTableValues(2, 10, 'en', 'desc') > 0);
});
test('natural sort handles text with embedded project numbers', () => {
  assert.ok(compareTableValues('PRJ-2', 'PRJ-10', 'en') < 0);
});
test('both languages sort alphabetic strings with locale collators', () => {
  assert.equal(compareTableValues('Same', 'same', 'en'), 0);
  assert.ok(compareTableValues('أ', 'ب', 'ar') < 0);
});
test('empty values stay at the bottom in both directions', () => {
  for (const dir of ['asc', 'desc']) {
    assert.ok(compareTableValues(null, 'أحمد', 'ar', dir) > 0);
    assert.ok(compareTableValues('أحمد', null, 'ar', dir) < 0);
    assert.equal(compareTableValues(null, null, 'en', dir), 0);
  }
});
test('English counts have Western digits and Arabic counts have Arabic numbering', () => {
  assert.equal(formatTableCount(1234, 'en'), '1,234');
  assert.match(formatTableCount(1234, 'ar'), /[٠-٩]/);
});
test('mobile navigation supports locale and route-aware closing', () => {
  const s = read('apps/web/src/components/MobileNav.tsx');
  assert.match(s, /translator\(ar \? 'ar' : 'en'\)/);
  assert.match(s, /aria-label=\{t\('Open navigation'\)\}/);
  assert.match(s, /aria-label=\{t\('Close navigation'\)\}/);
  assert.match(s, /aria-expanded=\{open\}/);
  assert.match(s, /e\.key === 'Escape'/);
  assert.match(s, /previousPath\.current !== path/);
  assert.match(s, /closest\('a\[href\]'\)/);
});
test('navigation passes selected locale and translates command groups', () => {
  const s = read('apps/web/src/app/(app)/layout.tsx');
  assert.match(s, /<MobileNav ar=\{ar\}>/);
  assert.match(s, /group: ar \? g\.ar : g\.label/);
  assert.match(s, /const commands = groups\.flatMap/);
});
test('tables use locale helpers and bidi isolation for raw values', () => {
  const s = read('apps/web/src/components/DataTable.tsx');
  assert.match(s, /compareTableValues\(x, y, locale, sort\.dir\)/);
  assert.match(s, /formatTableCount\(rows\.length, locale\)/);
  assert.match(s, /<bdi>/);
  assert.match(s, /aria-sort=\{can \?/);
});
test('localized chrome translations exist', () => {
  const s = read('packages/contracts/src/i18n.ts');
  for (const key of ["'Close navigation':", "'capabilities':", "'current':"]) {
    assert.ok(s.includes(key), `missing translation ${key}`);
  }
});
test('account switcher isolates bidi names and localizes count and state', () => {
  const s = read('apps/web/src/components/TenantSwitcher.tsx');
  assert.match(s, /<bdi>\{session\.displayName\}<\/bdi>/);
  assert.match(s, /Intl\.NumberFormat\(lang === 'ar' \? 'ar-SA' : 'en-US'\)/);
  assert.match(s, /tx\('current'\)/);
});

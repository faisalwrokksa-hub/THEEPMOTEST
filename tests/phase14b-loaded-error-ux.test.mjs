import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../apps/web/src/components/Page.tsx', import.meta.url), 'utf8');
const loaded = source.slice(source.indexOf('export async function Loaded'));

test('expired sessions offer an actionable sign-in link', () => {
  assert.match(loaded, /if \(err\.status === 401\)/);
  assert.match(loaded, /href="\/login"/);
});

test('customer-facing loading failures do not expose internal errors or developer commands', () => {
  assert.doesNotMatch(loaded, /\{err\.message\}|pnpm smoke/);
  assert.match(loaded, /role="alert"/);
});

test('expired-session and loading-failure states have explicit Arabic copy', () => {
  assert.match(loaded, /انتهت جلسة تسجيل الدخول/);
  assert.match(loaded, /تعذّر تحميل الصفحة/);
  assert.match(loaded, /const ar = \(await getLang\(\)\) === 'ar'/);
});

test('forbidden and unlicensed states do not render raw API details', () => {
  assert.doesNotMatch(loaded, /\{err\.detail\}/);
  assert.match(loaded, /if \(err\.status === 403\)/);
  assert.match(loaded, /This module is unavailable under the current workspace subscription/);
  assert.match(loaded, /You do not have permission to view this page/);
  assert.match(loaded, /هذه الوحدة غير متاحة/);
  assert.match(loaded, /ليس لديك إذن للوصول/);
});

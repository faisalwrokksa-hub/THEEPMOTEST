import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../apps/web/src/components/NewRecord.tsx', import.meta.url), 'utf8');

test('expired create sessions preserve the form and provide a sign-in action', () => {
  assert.match(source, /if \(res\.status === 401\) setSessionExpired\(true\)/);
  assert.match(source, /sessionExpired && <> <a href="\/login">/);
  assert.match(source, /setSessionExpired\(false\)/);
  assert.match(source, /if \(!isCreateSuccess\(res\.status, j, window\.location\.origin\)\)/);
});

test('create failures do not expose raw server messages to customers', () => {
  assert.doesNotMatch(source, /String\(j\?\.error/);
  assert.doesNotMatch(source, /\{j\?\.error\}/);
  assert.match(source, /That could not be saved\. Check your information and try again/);
});

test('create failure recovery has Arabic copy and rate-limit guidance', () => {
  assert.match(source, /انتهت جلسة تسجيل الدخول/);
  assert.match(source, /تسجيل الدخول/);
  assert.match(source, /res\.status === 429/);
  assert.match(source, /عدد المحاولات كبير/);
});

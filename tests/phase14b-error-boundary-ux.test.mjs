import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../apps/web/src/app/(app)/error.tsx', import.meta.url), 'utf8');

test('unexpected page errors do not display local developer commands', () => {
  assert.doesNotMatch(source, /pnpm dev|pnpm smoke|start it with/);
  assert.doesNotMatch(source, /\{error\.message\}/);
  assert.match(source, /The service is temporarily unavailable/);
});

test('error recovery uses document language and Arabic messages', () => {
  assert.match(source, /document\.documentElement\.lang\.toLowerCase\(\)\.startsWith\('ar'\)/);
  assert.match(source, /الخدمة غير متاحة مؤقتًا/);
  assert.match(source, /تعذّر تحميل هذه الصفحة/);
  assert.match(source, /إعادة المحاولة/);
});

test('recovery remains keyboard accessible and announces the failure', () => {
  assert.match(source, /role="alert"/);
  assert.match(source, /type="button" className="btn" onClick=\{reset\}/);
  assert.match(source, /href="\/"/);
  assert.match(source, /flexWrap: 'wrap'/);
});

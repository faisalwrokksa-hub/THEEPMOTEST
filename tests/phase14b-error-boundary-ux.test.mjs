import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

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


test('malformed thrown values do not dereference missing error fields', () => {
  assert.match(source, /typeof error\?\.message === 'string'/);
  assert.match(source, /typeof error\?\.digest === 'string'/);
  assert.match(source, /\.test\(message\)/);
  assert.doesNotMatch(source, /\.test\(error\.message\)/);
  assert.doesNotMatch(source, /\{error\.digest\}/);
});


test('actual recovery classification tolerates null, undefined and non-Error values', () => {
  const lines = source.match(/  const message = [^\n]+\n  const digest = [^\n]+\n  const unreachable = [^\n]+/);
  assert.ok(lines, 'the production recovery expressions must remain testable');
  for (const value of [null, undefined, 7, 'oops', {}, { message: 4, digest: {} }]) {
    const result = runInNewContext(`${lines[0]}\n({ message, digest, unreachable })`, { error: value });
    assert.equal(result.message, '');
    assert.equal(result.digest, '');
    assert.equal(result.unreachable, false);
  }
  const offline = runInNewContext(`${lines[0]}\n({ message, digest, unreachable })`,
    { error: { message: 'fetch failed', digest: 'ref-123' } });
  assert.equal(offline.unreachable, true);
  assert.equal(offline.digest, 'ref-123');
});

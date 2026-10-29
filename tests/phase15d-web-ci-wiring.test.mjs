import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
const root = resolve(fileURLToPath(new URL('../', import.meta.url)));
const ci = readFileSync(resolve(root, '.github/workflows/ci.yml'), 'utf8');
const runner = readFileSync(resolve(root, 'scripts/phase15d-run-web-smoke.sh'), 'utf8');
const checker = readFileSync(resolve(root, 'scripts/phase15d-web-smoke.mjs'), 'utf8');
test('CI executes runtime acceptance after compiling web and checking artifacts', () => {
  const build = ci.indexOf('pnpm --filter @pmo/web build');
  const artifact = ci.indexOf('node scripts/verify-build-artifacts.mjs --scope all');
  const smoke = ci.indexOf('bash scripts/phase15d-run-web-smoke.sh');
  assert.ok(build >= 0 && artifact > build && smoke > artifact);
});
test('runner starts compiled standalone server rather than dev server', () => {
  assert.match(runner, /apps\/web\/\.next-prod\/standalone\/apps\/web\/server\.js/);
  assert.match(runner, /NODE_ENV=production/);
  assert.doesNotMatch(runner, /next dev/);
});
test('runner fails clearly when compiled artifact is missing', () => {
  assert.match(runner, /if \[\[ ! -s "\$ARTIFACT" \]\]/);
});
test('runner terminates temporary web server on failures and success', () => {
  assert.match(runner, /trap cleanup EXIT/);
  assert.match(runner, /kill "\$WEB_PID"/);
});
test('web acceptance uses no credentials or mutating HTTP methods', () => {
  assert.match(checker, /method: 'GET'/);
  assert.match(checker, /redirect: 'manual'/);
  assert.doesNotMatch(checker, /method: '(POST|PATCH|DELETE)'/);
});
test('smoke covers Arabic RTL and the protected Super Admin page', () => {
  assert.match(checker, /pmo_lang=ar/);
  assert.match(checker, /lang: 'ar', dir: 'rtl'/);
  assert.match(checker, /'\/super-admin'/);
});

test('runner refuses to mistake a pre-existing service for the compiled app', () => {
  assert.match(runner, /port 3000 is already serving HTTP/);
});

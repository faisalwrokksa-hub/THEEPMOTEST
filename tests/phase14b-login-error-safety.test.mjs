import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const login = readFileSync(new URL('../apps/web/src/app/login/page.tsx', import.meta.url), 'utf8');
const route = readFileSync(new URL('../apps/web/src/app/api/session/route.ts', import.meta.url), 'utf8');
const layout = readFileSync(new URL('../apps/web/src/app/(app)/layout.tsx', import.meta.url), 'utf8');

test('login errors use a fixed allowlist and never render arbitrary query strings', () => {
  assert.match(login, /Object\.prototype\.hasOwnProperty\.call\(loginErrors, error\)/);
  assert.match(login, /loginErrors\.invalid/);
  assert.match(login, /role="alert"/);
  assert.doesNotMatch(login, /\{t\(error\)\}|\{error\}.*<\/p>/);
});

test('all login error codes have English and Arabic customer-safe copy', () => {
  for (const code of ['missing', 'invalid', 'unavailable', 'rate_limited', 'session_missing', 'expired']) {
    assert.match(login, new RegExp(`\\b${code}: \\{ en: '[^']+', ar: '[^']+' \\}`));
  }
  assert.match(login, /ar \? safeError\.ar : safeError\.en/);
});

test('session route never redirects backend response body or raw technical messages', () => {
  assert.match(route, /type LoginErrorCode =/);
  assert.match(route, /res\.status === 429/);
  assert.match(route, /res\.status >= 500/);
  assert.doesNotMatch(route, /body\?\.message|res\.json\(\)|back\('Cannot reach/);
  assert.match(route, /\/login\?error=\$\{code\}/);
});

test('expired-session redirect retains recovery guidance using stable code', () => {
  assert.match(layout, /redirect\(ended \? '\/login\?error=expired' : '\/login'\)/);
  assert.match(login, /expired: \{ en: 'Your session expired/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const route = readFileSync(new URL('../apps/web/src/app/api/session/route.ts', import.meta.url), 'utf8');

test('login preserves opaque cookie values containing equals padding', () => {
  assert.match(route, /line\?\.split\(';', 1\)\[0\]\?\.slice\(\x60\$\{SESSION\}=\x60\.length\)/);
  assert.doesNotMatch(route, /split\(' characteristic=|split\('='\)\[1\]/);
});

test('login refuses to create a session from a missing or empty token', () => {
  assert.match(route, /if \(!token\) return back\('session_missing'\)/);
  assert.match(route, /httpOnly: true/);
});

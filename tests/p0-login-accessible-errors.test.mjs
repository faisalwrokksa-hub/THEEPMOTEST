import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const page = readFileSync(new URL('../apps/web/src/app/login/page.tsx', import.meta.url), 'utf8');
test('sign-in errors are announced and associated with username and password', () => {
  assert.match(page, /id="login-error" className="formerr" role="alert"/);
  assert.equal((page.match(/aria-invalid=\{Boolean\(safeError\)\}/g) || []).length, 2);
  assert.equal((page.match(/aria-describedby=\{safeError \? "login-error" : undefined\}/g) || []).length, 2);
});

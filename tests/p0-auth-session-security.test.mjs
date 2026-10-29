import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isAllowedWriteRequest } from '../apps/api/src/common/write-origin.guard.ts';

const source = readFileSync(new URL('../apps/api/src/auth/auth.service.ts', import.meta.url), 'utf8');
const login = source.split('async login(')[1].split('private async defaultTenant(')[0];
const principal = source.split('async principal(')[1].split('async switchTenant(')[0];
const trusted = ['https://theepmo.example'];

test('unknown-account dummy password digest is a valid bcrypt format and cost 12', () => {
  const match = source.match(/const DUMMY_PASSWORD_HASH = '([^']+)'/);
  assert.ok(match);
  assert.match(match[1], /^\$2[ab]\$12\$[./A-Za-z0-9]{53}$/);
  assert.equal(match[1].length, 60);
  assert.doesNotMatch(match[1], /invalidinvalid/);
});
test('login executes a bcrypt comparison for unknown accounts before rejecting', () => {
  assert.match(login, /user\?\.passwordHash \?\? DUMMY_PASSWORD_HASH/);
  assert.match(login, /await bcrypt\.compare\(password, stored\)/);
  assert.ok(login.indexOf('await bcrypt.compare(password, stored)') < login.indexOf('if (!user || !ok || !user.isActive)'));
});
test('locked, invalid and no-membership sign-ins all use the same public denial', () => {
  assert.match(login, /if \(user\?\.lockedUntil[\s\S]*?throw new UnauthorizedException\(LOGIN_REJECTED\)/);
  assert.match(login, /if \(!user \|\| !ok \|\| !user\.isActive\)[\s\S]*?throw new UnauthorizedException\(LOGIN_REJECTED\)/);
  assert.match(login, /if \(memberOf\.length === 0\)[\s\S]*?throw new UnauthorizedException\(LOGIN_REJECTED\)/);
  assert.doesNotMatch(login, /Account temporarily locked\. Try again shortly\.|This account is not a member of any workspace/);
});
test('security event still distinguishes locked and failed sign-ins for administrators', () => {
  assert.match(login, /record\('login\.locked'/);
  assert.match(login, /record\('login\.fail'/);
});
test('disabled user sessions are deleted before returning unauthenticated', () => {
  assert.match(principal, /if \(!u \|\| !u\.isActive\)\s*\{\s*[\s\S]*?await db\.delete\(sessions\)[\s\S]*?return null;/);
});
test('revoked workspace membership deletes the active session', () => {
  assert.match(principal, /if \(!m\)\s*\{[\s\S]*?await db\.delete\(sessions\)[\s\S]*?return null;/);
});
test('cross-site requests are denied even with a trusted-looking Origin', () => {
  assert.equal(isAllowedWriteRequest('POST',trusted[0],'cross-site',trusted),false);
});
test('sibling-site browser POST cannot bypass Origin validation by omitting Origin', () => {
  assert.equal(isAllowedWriteRequest('POST',undefined,'same-site',trusted),false);
});
test('unlabelled internal server-to-server POST remains permitted', () => {
  assert.equal(isAllowedWriteRequest('POST',undefined,undefined,trusted),true);
});
test('legitimate same-origin browser writes remain permitted', () => {
  assert.equal(isAllowedWriteRequest('POST',trusted[0],'same-origin',trusted),true);
  assert.equal(isAllowedWriteRequest('POST',undefined,'same-origin',trusted),true);
});
test('untrusted origin or browser unknown site are rejected', () => {
  assert.equal(isAllowedWriteRequest('PATCH','https://evil.example','same-site',trusted),false);
  assert.equal(isAllowedWriteRequest('POST',undefined,'none',trusted),false);
});
test('GET and HEAD are not blocked by mutation CSRF protection', () => {
  assert.equal(isAllowedWriteRequest('GET',undefined,'cross-site',trusted),true);
  assert.equal(isAllowedWriteRequest('HEAD',undefined,'cross-site',trusted),true);
});

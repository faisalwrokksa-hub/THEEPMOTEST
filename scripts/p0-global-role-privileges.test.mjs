import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const rls = readFileSync('packages/db/sql/rls.sql', 'utf8');
const gate = readFileSync('packages/db/sql/assert-global-role-privileges.sql', 'utf8');
const deploy = readFileSync('infra/bootstrap-db.sh', 'utf8');
const ci = readFileSync('.github/workflows/ci.yml', 'utf8');
const middleware = readFileSync('apps/api/src/tenancy/tenant.middleware.ts', 'utf8');
const env = readFileSync('apps/api/src/common/env.ts', 'utf8');
const auth = readFileSync('apps/api/src/auth/auth.service.ts', 'utf8');
const invite = readFileSync('apps/api/src/onboarding/onboarding.service.ts', 'utf8');

function validateUsersGrant(sql) {
  // Check the FINAL section of the policy file: a late broad grant would
  // silently override restricted column grants from earlier in the script.
  const lastRevocation = sql.lastIndexOf('REVOKE INSERT, UPDATE, DELETE ON users FROM pmo_app;');
  if (lastRevocation < 0) return false;
  const tail = sql.slice(lastRevocation);
  return /GRANT INSERT \(email, display_name, password_hash\) ON users TO pmo_app;/.test(tail) &&
    /GRANT UPDATE \(failed_attempts, locked_until, last_login_at\) ON users TO pmo_app;/.test(tail) &&
    !/GRANT\s+(?:SELECT,\s*)?(?:INSERT|UPDATE)(?:\s*,\s*(?:INSERT|UPDATE|DELETE|SELECT))*\s+ON\s+users\s+TO\s+pmo_app\s*;/i.test(tail);
}
test('account writes are limited to explicitly required columns', () =>
  assert.equal(validateUsersGrant(rls), true));
test('a later blanket GRANT is rejected by the regression check', () =>
  assert.equal(validateUsersGrant(rls + '\nGRANT UPDATE ON users TO pmo_app;'), false));
test('missing blanket-rights revocation is rejected', () =>
  assert.equal(validateUsersGrant(rls.replace('REVOKE INSERT, UPDATE, DELETE ON users FROM pmo_app;', '-- removed')), false));
test('PostgreSQL gate checks effective privileges and protected account columns', () => {
  assert.match(gate, /has_table_privilege\('pmo_app', 'public\.users', 'UPDATE'\)/);
  assert.match(gate, /has_column_privilege\('pmo_app', 'public\.users', 'is_platform_admin', 'UPDATE'\)/);
  assert.match(gate, /has_column_privilege\('pmo_app', 'public\.users', 'is_platform_admin', 'INSERT'\)/);
  assert.match(gate, /has_column_privilege\('pmo_app', 'public\.users', 'is_active', 'UPDATE'\)/);
  assert.match(gate, /has_column_privilege\('pmo_app', 'public\.users', 'password_hash', 'UPDATE'\)/);
  assert.match(gate, /NOT has_column_privilege\('pmo_app', 'public\.users', 'failed_attempts', 'UPDATE'\)/);
  assert.match(gate, /rolbypassrls/);
});
test('staging bootstrap enforces global privileges after applying policies', () => {
  assert.ok(deploy.indexOf('< packages/db/sql/rls.sql') >= 0);
  assert.ok(deploy.indexOf('< packages/db/sql/assert-global-role-privileges.sql') > deploy.indexOf('< packages/db/sql/rls.sql'));
});
test('CI runs the global-user privilege gate before migrations/RLS evidence', () => {
  assert.ok(ci.indexOf('assert-global-role-privileges.sql') > ci.indexOf('Apply RLS policies'));
  assert.ok(ci.indexOf('assert-global-role-privileges.sql') < ci.indexOf('Record database migrations and RLS evidence'));
});
test('authentication uses only the granted update columns', () => {
  assert.match(auth, /failed_attempts\s*=/);
  assert.match(auth, /locked_until\s*=/);
  assert.match(auth, /lastLoginAt/);
  assert.doesNotMatch(auth, /UPDATE users SET[^`]*is_platform_admin/i);
});
test('new-account invitation uses only the granted insert columns', () =>
  assert.match(invite, /INSERT INTO users\(email,display_name,password_hash\)/));
test('header impersonation requires local development and a loopback socket', () => {
  assert.match(middleware, /NODE_ENV === 'development'/);
  assert.match(middleware, /DEPLOYMENT_ENV === 'development'/);
  assert.match(middleware, /remoteAddress/);
  assert.match(middleware, /127\.0\.0\.1/);
});
test('staging/prod reject header impersonation even under dev NODE_ENV', () => {
  assert.match(env, /env\.NODE_ENV !== 'development'/);
  assert.match(env, /process\.env\.DEPLOYMENT_ENV !== 'development'/);
  assert.match(env, /ALLOW_HEADER_AUTH requires local development mode/);
});

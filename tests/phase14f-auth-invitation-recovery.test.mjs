import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const auth = source('apps/api/src/auth/auth.service.ts');
const invite = source('apps/api/src/onboarding/onboarding.service.ts');
const schema = source('apps/api/src/onboarding/onboarding.schemas.ts');

const login = auth.split('async login(')[1].split('private async defaultTenant(')[0];
const inviteMethod = invite.split('async invite(')[1].split('async revoke(')[0];

test('failed sign-in counters increment in SQL rather than from a stale fetched value', () => {
  assert.match(login, /UPDATE users SET[\s\S]*?failed_attempts\s*=\s*CASE/);
  assert.match(login, /ELSE failed_attempts \+ 1 END/);
  assert.doesNotMatch(login, /user\.failedAttempts \+ 1/);
});

test('failed login is serialized by a single atomic database UPDATE', () => {
  const update = login.match(/await db\.execute\(sql`[\s\S]*?UPDATE users SET[\s\S]*?WHERE id = \$\{user\.id\}[\s\S]*?`\);/);
  assert.ok(update, 'one SQL statement should update both lockout columns');
  assert.match(update[0], /failed_attempts\s*=/);
  assert.match(update[0], /locked_until\s*=/);
  assert.match(update[0], /WHEN failed_attempts \+ 1 >= \$\{MAX_FAILED\}/);
});

test('lockout resets after expiration, not immediately relocked on first bad password', () => {
  assert.match(login, /locked_until IS NOT NULL AND locked_until <= now\(\) THEN 1/);
  assert.match(login, /locked_until IS NOT NULL AND locked_until <= now\(\) THEN NULL/);
  assert.match(login, /now\(\) \+ \(\$\{LOCK_MINUTES\} \* interval '1 minute'\)/);
});

test('account lock and inactive-account rejection still precede success and session creation', () => {
  assert.match(login, /if \(user\?\.lockedUntil && user\.lockedUntil > new Date\(\)\)/);
  assert.match(login, /if \(!user \|\| !ok \|\| !user\.isActive\)/);
  assert.ok(login.indexOf('if (!user || !ok || !user.isActive)') < login.indexOf('db.insert(sessions)'));
});

test('mail provider errors are handled as delivery failures and never leak to caller', () => {
  assert.match(inviteMethod, /try\s*\{\s*result = await transport\.send/);
  assert.match(inviteMethod, /catch\s*\{[\s\S]*?result = \{ ok: false \}/);
  assert.match(inviteMethod, /throw new ServiceUnavailableException\('Email delivery failed; the invitation has been invalidated\.'\)/);
});

test('failed or thrown delivery revokes the pending token before reporting failure', () => {
  const delivery = inviteMethod.indexOf('result = await transport.send');
  const update = inviteMethod.indexOf('UPDATE tenant_invitations', delivery);
  const response = inviteMethod.indexOf('if (!result.ok) throw new ServiceUnavailableException', delivery);
  assert.ok(delivery >= 0 && update > delivery && response > update);
  assert.match(inviteMethod.slice(update, response), /delivery_status=\$\{result\.ok \? 'sent' : 'failed'\}/);
  assert.match(inviteMethod.slice(update, response), /revoked_at=CASE WHEN \$\{result\.ok\} THEN revoked_at ELSE now\(\) END/);
});

test('invitation token never leaves the service response and the acceptance policy remains single-use', () => {
  assert.match(schema, /token: z\.string\(\)\.min\(80\)\.max\(100\)/);
  assert.doesNotMatch(inviteMethod, /return \{ token/);
  assert.match(invite, /SET consumed_at=now\(\), accepted_by=/);
});

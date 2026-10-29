import test from 'node:test';
import assert from 'node:assert/strict';
import { assertDisposableAcceptanceConfig, DISPOSABLE_ACK } from './phase15c-acceptance-safety.mjs';
const good = {
  PHASE15_BILLING_ACCEPTANCE: 'true',
  PHASE15_ACCEPT_DISPOSABLE_DB: DISPOSABLE_ACK,
  NODE_ENV: 'test',
  DATABASE_URL: 'postgres://pmo_app:local@localhost:5433/pmo',
  DATABASE_URL_ADMIN: 'postgres://postgres:local@localhost:5433/pmo',
  TEST_API: 'http://localhost:4000',
};
const rejected = (patch, message) => assert.throws(
  () => assertDisposableAcceptanceConfig({ ...good, ...patch }), message);
test('disabled by default: ordinary tests remain non-destructive', () =>
  assert.deepEqual(assertDisposableAcceptanceConfig({}), { enabled: false }));
test('valid disposable local test database permits live test', () =>
  assert.equal(assertDisposableAcceptanceConfig(good).enabled, true));
test('requires separate explicit destructive-fixture acknowledgement', () =>
  rejected({ PHASE15_ACCEPT_DISPOSABLE_DB: '' }, /acknowledgement/));
test('rejects production runtime', () => rejected({ NODE_ENV: 'production' }, /NODE_ENV/));
test('rejects staging deployment', () => rejected({ DEPLOYMENT_ENV: 'staging' }, /deployment mode/));
test('rejects remote admin database', () => rejected({ DATABASE_URL_ADMIN: 'postgres://postgres:p@db.internal/pmo' }, /loopback/));
test('rejects mixed database names', () => rejected({ DATABASE_URL_ADMIN: 'postgres://postgres:p@localhost:5433/customer' }, /must match/));
test('rejects mixed database ports', () => rejected({ DATABASE_URL_ADMIN: 'postgres://postgres:p@localhost:5432/pmo' }, /must match/));
test('rejects privileged application connection', () => rejected({ DATABASE_URL: 'postgres://postgres:p@localhost:5433/pmo' }, /pmo_app/));
test('rejects insecure nonlocal API', () => rejected({ TEST_API: 'https://epmo.example.com' }, /local HTTP/));
test('rejects databases without a password', () => rejected({ DATABASE_URL_ADMIN: 'postgres://postgres@localhost:5433/pmo' }, /credentials/));
test('does not print secrets in failure messages', () => {
  const secret = 'do_not_echo_secret';
  assert.throws(() => assertDisposableAcceptanceConfig({ ...good, DATABASE_URL: `postgres://pmo_app:${secret}@example.com/pmo` }),
    error => !error.message.includes(secret) && /loopback/.test(error.message));
});

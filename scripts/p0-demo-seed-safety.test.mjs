import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assertDisposableSeedSafety, DISPOSABLE_SEED_ACK } from '../packages/db/src/seed-safety.ts';

const valid = {
  NODE_ENV: 'test', PHASE15_ACCEPT_DISPOSABLE_DB: DISPOSABLE_SEED_ACK,
  DATABASE_URL: 'postgres://pmo_app:local_app@localhost:5433/pmo',
  DATABASE_URL_ADMIN: 'postgres://postgres:local_admin@localhost:5433/pmo',
};
function refuses(changes, pattern) {
  assert.throws(() => assertDisposableSeedSafety({ ...valid, ...changes }), pattern);
}
test('explicit acknowledgement and matching local DB permits CI demo seed', () => {
  assert.doesNotThrow(() => assertDisposableSeedSafety(valid));
});
test('local development requires the same explicit acknowledgement', () => {
  assert.doesNotThrow(() => assertDisposableSeedSafety({ ...valid, NODE_ENV: 'development', DEPLOYMENT_ENV: 'development' }));
  refuses({ NODE_ENV: 'development', PHASE15_ACCEPT_DISPOSABLE_DB: undefined }, /acknowledgement/);
});
test('never seed on production or unknown Node environments', () => {
  for (const value of ['production', 'stage', undefined, ''])
    refuses({ NODE_ENV: value }, /NODE_ENV/);
});
test('never seed a staging or production deployment even with NODE_ENV=test', () => {
  for (const value of ['staging', 'production', 'qa'])
    refuses({ NODE_ENV: 'test', DEPLOYMENT_ENV: value }, /deployed environment/);
});
test('rejects remote databases even with an acknowledgement', () => {
  refuses({ DATABASE_URL_ADMIN: 'postgres://postgres:secret@db.prod.example/pmo' }, /loopback/);
  refuses({ DATABASE_URL: 'postgres://pmo_app:secret@db.prod.example/pmo' }, /loopback/);
});
test('rejects different databases or ports and different hostnames', () => {
  refuses({ DATABASE_URL_ADMIN: 'postgres://postgres:secret@localhost:5433/client' }, /same database/);
  refuses({ DATABASE_URL_ADMIN: 'postgres://postgres:secret@localhost:5432/pmo' }, /same database/);
  refuses({ DATABASE_URL_ADMIN: 'postgres://postgres:secret@127.0.0.1:5433/pmo' }, /same database/);
});
test('rejects a privileged app connection or identical admin role', () => {
  refuses({ DATABASE_URL: 'postgres://postgres:secret@localhost:5433/pmo' }, /restricted pmo_app/);
  refuses({ DATABASE_URL_ADMIN: valid.DATABASE_URL }, /separate admin role/);
});
test('never accepts missing credentials or non-PostgreSQL URLs', () => {
  refuses({ DATABASE_URL: 'postgres://pmo_app@localhost:5433/pmo' }, /credentials/);
  refuses({ DATABASE_URL_ADMIN: 'http://postgres:secret@localhost:5433/pmo' }, /PostgreSQL/);
});
test('seed performs safety checks before database client construction or deletes', () => {
  const src = readFileSync('packages/db/src/seed.ts', 'utf8');
  const guard = src.indexOf('assertDisposableSeedSafety(process.env)');
  assert.ok(guard >= 0);
  assert.ok(guard < src.indexOf('const client = postgres('));
  assert.ok(guard < src.indexOf('await db.delete(s.tenants)'));
});
test('CI opts in only with a local disposable app+admin database configuration', () => {
  const ci = readFileSync('.github/workflows/ci.yml', 'utf8');
  assert.match(ci, /DATABASE_URL: postgres:\/\/pmo_app:[^\n]+@localhost:5433\/pmo/);
  assert.match(ci, /DATABASE_URL_ADMIN: postgres:\/\/postgres:[^\n]+@localhost:5433\/pmo/);
  assert.match(ci, /PHASE15_ACCEPT_DISPOSABLE_DB: 'YES_RESEED_DISPOSABLE_TEST_DATABASE'/);
});
test('failure errors do not disclose connection credentials', () => {
  const secret = 'dont-log-me';
  assert.throws(() => assertDisposableSeedSafety({ ...valid, DATABASE_URL: `postgres://pmo_app:${secret}@outside.example/pmo` }),
    error => !error.message.includes(secret) && /loopback/.test(error.message));
});

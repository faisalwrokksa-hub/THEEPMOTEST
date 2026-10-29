import test from 'node:test';
import assert from 'node:assert/strict';
import { validateCiServicesEnv } from './verify-ci-services.mjs';
const good = { CI: 'true', GITHUB_ACTIONS: 'true', NODE_ENV: 'test',
  PHASE15_ACCEPT_DISPOSABLE_DB: 'YES_RESEED_DISPOSABLE_TEST_DATABASE',
  DATABASE_URL: 'postgres://pmo_app:test@localhost:5433/pmo',
  DATABASE_URL_ADMIN: 'postgres://postgres:test@localhost:5433/pmo',
  REDIS_URL: 'redis://localhost:6380' };
test('accepts isolated CI-only services', () => assert.deepEqual(validateCiServicesEnv(good), []));
test('rejects external database targets', () => assert.ok(validateCiServicesEnv({ ...good, DATABASE_URL: 'postgres://pmo_app:test@production.example:5433/pmo' }).length));
test('rejects missing explicit disposable acknowledgement', () => assert.ok(validateCiServicesEnv({ ...good, PHASE15_ACCEPT_DISPOSABLE_DB: '' }).length));
test('rejects production execution context', () => assert.ok(validateCiServicesEnv({ ...good, NODE_ENV: 'production' }).length));
test('rejects unexpected redis endpoint', () => assert.ok(validateCiServicesEnv({ ...good, REDIS_URL: 'redis://cache.example:6379' }).length));

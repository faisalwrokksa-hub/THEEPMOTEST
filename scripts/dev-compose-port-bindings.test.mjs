import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const compose = readFileSync(fileURLToPath(new URL('../docker-compose.yml', import.meta.url)), 'utf8');
test('S22 dev PostgreSQL and Redis host ports are loopback-only', () => {
  assert.match(compose, /^\s+ports:\s*\["127\.0\.0\.1:5433:5432"\]/m);
  assert.match(compose, /^\s+ports:\s*\["127\.0\.0\.1:6380:6379"\]/m);
  assert.doesNotMatch(compose, /ports:\s*\["(?:0\.0\.0\.0:)?(?:5433:5432|6380:6379)"\]/);
});

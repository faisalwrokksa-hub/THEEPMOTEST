import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('disposable restore rejects unsafe PostgreSQL URI before database access', () => {
  const script = fileURLToPath(new URL('./verify-disposable-postgres-restore-negative.test.sh', import.meta.url));
  const result = spawnSync('bash', [script], {
    encoding: 'utf8',
    timeout: 15000,
    env: { ...process.env, CI: 'true' },
  });
  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.status, 0, [result.stdout, result.stderr].filter(Boolean).join('\n'));
  assert.match(result.stdout, /PASS: invalid restore URIs fail before database access/);
});

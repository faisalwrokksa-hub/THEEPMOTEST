import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

test('disposable PostgreSQL restore rejects URI redirection before database commands', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const result = spawnSync('bash', [join(here, 'test-disposable-postgres-restore.sh')], {
    cwd: join(here, '..'),
    encoding: 'utf8',
    timeout: 15000,
  });
  assert.equal(result.status, 0, [result.stdout, result.stderr, result.error?.message].filter(Boolean).join('\n'));
  assert.match(result.stdout, /PASS: disposable restore URI guards/);
});

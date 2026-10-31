import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, chmodSync, readFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('./verify-disposable-postgres-restore.sh', import.meta.url));

test('disposable restore rejects incomplete archives and empty outcomes', () => {
  const dir = mkdtempSync(join(tmpdir(), 'epmo-restore-test-'));
  try {
    const bin = join(dir, 'bin');
    mkdirSync(bin);
    const archive = join(dir, 'backup.dump');
    const log = join(dir, 'calls.log');
    writeFileSync(archive, 'fixture: fake archive intercepted by mocked tools');
    const pgRestore = `#!/usr/bin/env bash
set -eu
if [[ "\${1:-}" == "--list" ]]; then
  if [[ "\${FAKE_ARCHIVE_TABLES:-1}" == "1" ]]; then
    echo '215; 1259 16508 TABLE public demo postgres'
    if [[ "\${FAKE_ARCHIVE_DATA:-1}" == "1" ]]; then
      echo '216; 0 16508 TABLE DATA public demo postgres'
    fi
  else
    echo '; Archive created at test time'
  fi
else
  echo 'restore' >> "$FAKE_LOG"
fi
`;
    const psql = `#!/usr/bin/env bash
set -eu
echo 'psql' >> "$FAKE_LOG"
if [[ "$*" == *'pg_catalog.pg_class'* ]]; then
  echo "\${FAKE_PRE_COUNT:-0}"
elif [[ "$*" == *'pg_catalog.pg_tables'* ]]; then
  echo "\${FAKE_POST_COUNT:-1}"
else
  exit 99
fi
`;
    for (const [name, source] of [['pg_restore', pgRestore], ['psql', psql]]) {
      const path = join(bin, name);
      writeFileSync(path, source);
      chmodSync(path, 0o755);
    }
    const baseEnv = { ...process.env };
    for (const key of ['PGHOST','PGHOSTADDR','PGSERVICE','PGSERVICEFILE','PGDATABASE','PGOPTIONS']) delete baseEnv[key];
    const run = (options) => {
      writeFileSync(log, '');
      const env = {
        ...baseEnv,
        PATH: `${bin}:${process.env.PATH}`,
        BACKUP_FILE: archive,
        RESTORE_DATABASE_URL: 'postgresql://localhost/epmo_restore_fixture',
        ALLOW_DISPOSABLE_RESTORE: 'YES',
        FAKE_LOG: log,
        ...options,
      };
      const result = spawnSync('bash', [script], { env, encoding: 'utf8', timeout: 15000 });
      assert.equal(result.error, undefined, result.error?.message);
      return { ...result, calls: readFileSync(log, 'utf8') };
    };
    const empty = run({ FAKE_ARCHIVE_TABLES: '0' });
    assert.equal(empty.status, 2, empty.stderr);
    assert.match(empty.stderr, /archive has no TABLE definitions/);
    assert.equal(empty.calls, '', 'empty archive must not open the database');

    const schemaOnly = run({ FAKE_ARCHIVE_DATA: '0' });
    assert.equal(schemaOnly.status, 2, schemaOnly.stderr);
    assert.match(schemaOnly.stderr, /no TABLE DATA entries/);
    assert.equal(schemaOnly.calls, '', 'schema-only archive must not open the database');

    const nonempty = run({ FAKE_PRE_COUNT: '1' });
    assert.equal(nonempty.status, 2, nonempty.stderr);
    assert.doesNotMatch(nonempty.calls, /restore/);

    const zero = run({ FAKE_POST_COUNT: '0' });
    assert.equal(zero.status, 2, zero.stderr);
    assert.match(zero.stderr, /no user tables were verified/);
    assert.match(zero.calls, /restore/);

    const positive = run({ FAKE_POST_COUNT: '3' });
    assert.equal(positive.status, 0, positive.stderr);
    assert.match(positive.stdout, /PASS: 3 user tables restored/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

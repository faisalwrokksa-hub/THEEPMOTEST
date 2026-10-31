import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, chmodSync, readFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('./verify-disposable-postgres-restore.sh', import.meta.url));

test('S25: restore credentials never enter subprocess argv and PGPORT cannot override target', () => {
  const dir = mkdtempSync(join(tmpdir(), 'epmo-restore-argv-'));
  try {
    const bin = join(dir, 'bin');
    mkdirSync(bin);
    const archive = join(dir, 'backup.dump');
    const log = join(dir, 'calls.log');
    const secret = 'S25_argv_secret_8437';
    const url = 'postgresql://test:' + secret + '@localhost:5433/epmo_restore_fixture';
    writeFileSync(archive, 'mock archive');
    for (const name of ['psql', 'pg_restore']) {
      const path = join(bin, name);
      const fake = '#!/usr/bin/env bash\nset -eu\n' +
        'printf "%s\\n" "' + name + ': $*" >> "$FAKE_LOG"\n' +
        '[[ "$PGDATABASE" == "$EXPECTED_DATABASE" && "$PGHOST" == localhost && "$PGPORT" == 5433 && "$PGUSER" == test && "$PGPASSWORD" == "$EXPECTED_PASSWORD" ]] || exit 91\n' +
        'if [[ "' + name + '" == pg_restore && "$1" == "--list" ]]; then\n' +
        "  echo '215; 1259 16508 TABLE public demo postgres'\n" +
        "  echo '216; 0 16508 TABLE DATA public demo postgres'\n" +
        'elif [[ "' + name + '" == psql ]]; then\n' +
        '  if [[ "$*" == *pg_catalog.pg_class* ]]; then echo 0; else echo 3; fi\nfi\n';
      writeFileSync(path, fake);
      chmodSync(path, 0o700);
    }
    const base = { ...process.env };
    for (const key of ['PGHOST','PGHOSTADDR','PGPORT','PGSERVICE','PGSERVICEFILE','PGDATABASE','PGOPTIONS']) delete base[key];
    const env = { ...base, PATH: bin + ':' + process.env.PATH, BACKUP_FILE: archive,
      RESTORE_DATABASE_URL: url, EXPECTED_DATABASE: 'epmo_restore_fixture', EXPECTED_PASSWORD: secret, FAKE_LOG: log,
      ALLOW_DISPOSABLE_RESTORE: 'YES' };
    const result = spawnSync('bash', [script], { env, encoding: 'utf8', timeout: 15000 });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /PASS: 3 user tables/);
    const calls = readFileSync(log, 'utf8');
    assert.match(calls, /pg_restore: --exit-on-error.*--dbname=epmo_restore_fixture/);
    assert.match(calls, /psql: -X/);
    assert.doesNotMatch(calls, /S25_argv_secret_8437|postgresql:\/\//);
    writeFileSync(log, '');
    const blocked = spawnSync('bash', [script], { env: { ...env, PGPORT: '6543' }, encoding: 'utf8' });
    assert.equal(blocked.status, 2, blocked.stderr);
    assert.match(blocked.stderr, /unset PGPORT/);
    assert.equal(readFileSync(log, 'utf8'), '');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

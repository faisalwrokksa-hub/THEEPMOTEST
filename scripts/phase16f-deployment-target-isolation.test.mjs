import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, chmodSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '..');
function run(script, mode, extra = {}) {
  return spawnSync('bash', [resolve(root, 'infra', script), mode], {
    cwd: root, encoding: 'utf8', timeout: 10000,
    env: { ...process.env, EPMO_DEPLOY_HOST: 'deploy@safe.example',
      EPMO_DEPLOY_SSH_KEY: '', EPMO_DEPLOY_DIR: '', ...extra },
  });
}

for (const script of ['deploy.sh', 'sync-catalogue.sh']) {
  test(`${script} rejects root and parent-only destinations before invoking remote tools`, () => {
    for (const path of ['/', '/opt', '/opt/', '/opt/..', '/opt/./the-epmo-staging',
      '/opt//the-epmo-staging', '/opt/../the-epmo-staging']) {
      const result = run(script, 'staging', { EPMO_DEPLOY_DIR: path });
      assert.equal(result.status, 2, `${path}: ${result.stderr}`);
      assert.match(result.stderr, /EPMO_DEPLOY_DIR/);
    }
  });

  test(`${script} rejects cross-environment destination selection`, () => {
    for (const [mode, forbidden] of [
      ['staging', '/opt/the-epmo'], ['staging', '/opt/the-epmo-dev'],
      ['prod', '/opt/the-epmo-staging'], ['dev', '/opt/the-epmo'],
    ]) {
      const result = run(script, mode, { EPMO_DEPLOY_DIR: forbidden });
      assert.equal(result.status, 2, `${mode} -> ${forbidden}: ${result.stderr}`);
    }
  });

  test(`${script} checks remote resolved directory before modifying files`, () => {
    const source = readFileSync(resolve(root, 'infra', script), 'utf8');
    assert.match(source, /realpath -e '\$DIR'/);
    assert.match(source, /EXPECTED_DIRNAME/);
  });
}

test('staging deployment with a custom isolated checkout performs remote checks before rsync', () => {
  const dir = mkdtempSync(join(tmpdir(), 'epmo-stage-path-'));
  try {
    const trace = join(dir, 'trace');
    for (const cmd of ['ssh', 'rsync']) {
      const p = join(dir, cmd);
      writeFileSync(p, `#!/bin/sh
printf '%s: %s\n' '${cmd}' "$*" >> "$TRACE"
case "$*" in
  *"infra/backup-db.sh 'staging'"*) echo 'PASS: verified pre-migration PostgreSQL backup: /opt/epmo-backups/epmo-staging-test-abcdef.dump' ;;
esac
exit 0
`);
      chmodSync(p, 0o755);
    }
    const result = run('deploy.sh', 'staging', {
      EPMO_DEPLOY_DIR: '/srv/epmo/the-epmo-staging', TRACE: trace,
      PATH: `${dir}:${process.env.PATH}`,
    });
    assert.equal(result.status, 0, result.stderr);
    const calls = readFileSync(trace, 'utf8');
    assert.ok(calls.indexOf('realpath -e') >= 0, calls);
    assert.ok(calls.indexOf('realpath -e') < calls.indexOf('rsync:'), calls);
    assert.match(calls, /\/srv\/epmo\/the-epmo-staging/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('symlinked remote checkout blocks staging deployment before rsync', () => {
  const dir = mkdtempSync(join(tmpdir(), 'epmo-stage-symlink-'));
  try {
    const trace = join(dir, 'trace');
    const ssh = join(dir, 'ssh');
    writeFileSync(ssh, '#!/bin/sh\nprintf "ssh: %s\\n" "$*" >> "$TRACE"\ncase "$*" in *"realpath -e"*) exit 9 ;; esac\nexit 0\n');
    const rsync = join(dir, 'rsync');
    writeFileSync(rsync, '#!/bin/sh\nprintf "rsync: %s\\n" "$*" >> "$TRACE"\nexit 0\n');
    chmodSync(ssh, 0o755); chmodSync(rsync, 0o755);
    const result = run('deploy.sh', 'staging', { TRACE: trace, PATH: `${dir}:${process.env.PATH}` });
    assert.equal(result.status, 1, result.stderr);
    const calls = readFileSync(trace, 'utf8');
    assert.match(calls, /realpath -e/);
    assert.doesNotMatch(calls, /rsync:/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

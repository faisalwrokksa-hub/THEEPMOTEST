import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, chmodSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const repo = resolve(import.meta.dirname, '..');
const script = resolve(repo, 'infra/deploy.sh');
const source = readFileSync(script, 'utf8');
function run(mode, env = {}, cwd = repo) {
  return spawnSync('bash', [script, mode], {
    cwd, encoding: 'utf8', env: {
      ...process.env,
      EPMO_DEPLOY_HOST: '', EPMO_DEPLOY_SSH_KEY: '',
      ...env,
    }, timeout: 10000,
  });
}

test('deployment script has valid bash syntax', () => {
  const result = spawnSync('bash', ['-n', script], {encoding:'utf8'});
  assert.equal(result.status, 0, result.stderr);
});
test('deployment fails closed with no explicit server', () => {
  const result = run('staging');
  assert.equal(result.status, 2);
  assert.match(result.stderr, /EPMO_DEPLOY_HOST/);
});
test('deployment rejects command injection in host or target path', () => {
  assert.equal(run('staging',{EPMO_DEPLOY_HOST:'user@host;whoami'}).status,2);
  assert.equal(run('staging',{EPMO_DEPLOY_HOST:'user@host',EPMO_DEPLOY_DIR:'/opt/../etc'}).status,2);
});
test('deployment refuses missing SSH key before contacting server', () => {
  const result = run('staging',{EPMO_DEPLOY_HOST:'deploy@stage.test', EPMO_DEPLOY_SSH_KEY:'/missing/epmo-key'});
  assert.equal(result.status,2);
  assert.match(result.stderr,/identity file/);
});
test('staging calls secure transport, preflight, bootstrap and bounded health check', () => {
  const dir = mkdtempSync(join(tmpdir(), 'epmo-deploy-test-'));
  try {
    const log = join(dir, 'calls.txt');
    for (const tool of ['ssh','rsync']) {
      const file = join(dir, tool);
      writeFileSync(file, `#!/bin/sh\nprintf '%s: %s\\n' '${tool}' "$*" >> "$EPMO_DEPLOY_TRACE"\ncase "$*" in
  *"infra/backup-db.sh 'staging'"*) printf '%s\n' 'PASS: verified pre-migration PostgreSQL backup: /opt/epmo-backups/epmo-staging-20261026T120000Z-abcdef.dump' ;;
esac
exit 0
`);
      chmodSync(file,0o755);
    }
    const result = run('staging', {
      EPMO_DEPLOY_HOST:'deploy@staging.theepmo.com',
      EPMO_DEPLOY_TRACE:log,
      PATH:`${dir}:${process.env.PATH}`,
    });
    assert.equal(result.status,0, result.stderr || result.stdout);
    const calls = readFileSync(log,'utf8');
    assert.match(calls,/ssh: -o BatchMode=yes -o StrictHostKeyChecking=yes/);
    assert.match(calls,/rsync: .*--exclude \.env\.\*/);
    assert.match(calls,/rc1-release-gate\.mjs --mode 'staging' --env-file/);
    assert.match(calls,/bootstrap-db\.sh 'staging'/);
    assert.match(calls,/rehearse-db-restore\.sh staging/);
    assert.ok(calls.indexOf('backup-db.sh') < calls.indexOf('rehearse-db-restore.sh'));
    assert.ok(calls.indexOf('rehearse-db-restore.sh') < calls.indexOf('bootstrap-db.sh'));
    assert.match(calls,/docker compose .* -p pmo-staging/);
    assert.match(calls,/seq 1 60/);
    assert.doesNotMatch(calls,/StrictHostKeyChecking=no|3\.111\.66\.127/);
  } finally { rmSync(dir,{recursive:true,force:true}); }
});
test('remote prerequisite check happens before destructive file sync', () => {
  const dir = mkdtempSync(join(tmpdir(), 'epmo-prereq-order-'));
  try {
    const log = join(dir, 'calls.txt');
    for (const tool of ['ssh', 'rsync']) {
      const file = join(dir, tool);
      writeFileSync(file, `#!/bin/sh\nprintf '%s\\n' "${tool}: $*" >> "$EPMO_DEPLOY_TRACE"\ncase "$*" in
  *"infra/backup-db.sh 'staging'"*) printf '%s\n' 'PASS: verified pre-migration PostgreSQL backup: /opt/epmo-backups/epmo-staging-20261026T120000Z-abcdef.dump' ;;
esac
exit 0
`);
      chmodSync(file, 0o755);
    }
    const result = run('staging', {
      EPMO_DEPLOY_HOST: 'deploy@staging.theepmo.com',
      EPMO_DEPLOY_TRACE: log,
      PATH: `${dir}:${process.env.PATH}`,
    });
    assert.equal(result.status, 0, result.stderr);
    const calls = readFileSync(log, 'utf8');
    assert.ok(calls.indexOf('test -d') >= 0, calls);
    assert.ok(calls.indexOf('test -d') < calls.indexOf('rsync:'), calls);
    assert.match(calls, /test -r.*\.env\.staging/);
    assert.match(calls, /command -v docker/);
  } finally { rmSync(dir, {recursive:true, force:true}); }
});
test('missing remote staging configuration blocks before rsync', () => {
  const dir = mkdtempSync(join(tmpdir(), 'epmo-prereq-fail-'));
  try {
    const log = join(dir, 'calls.txt');
    const ssh = join(dir, 'ssh');
    writeFileSync(ssh, `#!/bin/sh\nprintf '%s\\n' 'ssh: $*' >> "$EPMO_DEPLOY_TRACE"\nexit 7\n`);
    chmodSync(ssh, 0o755);
    const rsync = join(dir, 'rsync');
    writeFileSync(rsync, `#!/bin/sh\nprintf '%s\\n' 'rsync: $*' >> "$EPMO_DEPLOY_TRACE"\nexit 0\n`);
    chmodSync(rsync, 0o755);
    const result = run('staging', {
      EPMO_DEPLOY_HOST: 'deploy@staging.theepmo.com',
      EPMO_DEPLOY_TRACE: log,
      PATH: `${dir}:${process.env.PATH}`,
    });
    assert.equal(result.status, 1, result.stdout);
    assert.match(result.stderr, /No files copied/);
    assert.doesNotMatch(readFileSync(log, 'utf8'), /rsync:/);
  } finally { rmSync(dir, {recursive:true, force:true}); }
});
test('branded deployment targets are used by default', () => {
  assert.match(source, /DIR=\/opt\/the-epmo;/);
  assert.match(source, /DIR=\/opt\/the-epmo-dev;/);
});

test('no baked server or indefinite health polling in deploy code', () => {
  assert.doesNotMatch(source,/3\.111\.66\.127|StrictHostKeyChecking=no/);
  assert.match(source,/seq 1 60/);
  assert.match(source,/--mode.*production/);
  assert.match(source,/--mode.*staging/);
});

test('failed staging restore rehearsal aborts before SQL migrations', () => {
  const dir=mkdtempSync(join(tmpdir(),'epmo-rehearsal-fail-'));
  try {
    const log=join(dir,'calls');
    const ssh=join(dir,'ssh');
    writeFileSync(ssh, `#!/bin/sh
printf '%s\n' "$*" >> "$EPMO_DEPLOY_TRACE"
case "$*" in
  *"infra/backup-db.sh 'staging'"*) printf '%s\n' 'PASS: verified pre-migration PostgreSQL backup: /opt/backups/epmo-staging-20261026T120000Z-abcdef.dump' ;;
  *"infra/rehearse-db-restore.sh staging"*) exit 9 ;;
esac
exit 0
`);
    const rsync=join(dir,'rsync');
    writeFileSync(rsync,'#!/bin/sh\nexit 0\n');
    chmodSync(ssh,0o755);chmodSync(rsync,0o755);
    const result=run('staging',{
      EPMO_DEPLOY_HOST:'deploy@stage.test', EPMO_DEPLOY_TRACE:log,
      PATH:`${dir}:${process.env.PATH}`,
    });
    assert.equal(result.status,9,result.stderr||result.stdout);
    const trace=readFileSync(log,'utf8');
    assert.match(trace,/rehearse-db-restore\.sh staging/);
    assert.doesNotMatch(trace,/bootstrap-db\.sh/);
    assert.doesNotMatch(trace,/docker compose .* up -d api web/);
  }finally{rmSync(dir,{recursive:true,force:true});}
});

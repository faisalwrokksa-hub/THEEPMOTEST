import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, writeFileSync, readFileSync, statSync, chmodSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateLocalRecoveryEnv, runLocalSyntheticRecovery } from './staging-synthetic-local-recovery.mjs';

const image = 'postgres:16-alpine@sha256:' + 'a'.repeat(64);
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'epmo-s36-test-'));
  const keyFile = join(dir, 'key');
  writeFileSync(keyFile, randomBytes(32), { mode: 0o600 });
  const env = { DEPLOYMENT_ENV: 'staging', EPMO_SYNTHETIC_ONLY: 'YES',
    EPMO_LOCAL_DRILL_APPROVED: 'YES', EPMO_PG_IMAGE: image,
    EPMO_LOCAL_DRILL_KEY_FILE: keyFile };
  return { dir, keyFile, env, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}
function fakeDocker({ failRestore = false } = {}) {
  const calls = [], states = new Map();
  const runner = (bin, args, opts) => {
    assert.equal(bin, 'docker');
    assert.deepEqual(args.slice(0, 2), ['--host', 'unix:///var/run/docker.sock']);
    assert.deepEqual(Object.keys(opts.env).sort(), ['HOME', 'PATH']);
    const cmd = args.slice(2), op = cmd[0];
    calls.push(cmd);
    if (op === 'image') return { status: 0, stdout: Buffer.from('[]') };
    if (op === 'run') {
      const id = cmd[cmd.indexOf('--name') + 1];
      states.set(id, 'new');
      return { status: 0, stdout: Buffer.from(id) };
    }
    if (op === 'rm') { states.delete(cmd.at(-1)); return { status: 0, stdout: Buffer.alloc(0) }; }
    if (op === 'exec') {
      const id = cmd[1] === '-i' ? cmd[2] : cmd[1];
      const action = cmd.find(x => ['pg_isready', 'psql', 'pg_dump', 'pg_restore'].includes(x));
      if (action === 'pg_isready') return { status: 0, stdout: Buffer.alloc(0) };
      if (action === 'pg_dump') return { status: 0, stdout: Buffer.from('PGDMP' + 'synthetic-data'.repeat(20)) };
      if (action === 'pg_restore') {
        assert.ok(Buffer.isBuffer(opts.input));
        if (failRestore) return { status: 1, stdout: Buffer.alloc(0) };
        states.set(id, 'restored'); return { status: 0, stdout: Buffer.alloc(0) };
      }
      if (action === 'psql') {
        const query = cmd[cmd.indexOf('-c') + 1] || '';
        if (query.startsWith('SELECT')) {
          const data = states.get(id) === 'failed'
            ? '1|S36_SYNTHETIC_FAILED\n2|S36_SYNTHETIC_SECOND\n'
            : '1|S36_SYNTHETIC_ORIGINAL\n2|S36_SYNTHETIC_SECOND\n';
          return { status: 0, stdout: Buffer.from(data) };
        }
        if (query.startsWith('UPDATE')) states.set(id, 'failed');
        else states.set(id, 'seeded');
        return { status: 0, stdout: Buffer.alloc(0) };
      }
    }
    throw new Error('Unexpected Docker command ' + cmd.join(' '));
  };
  return { runner, calls, states };
}

test('S36 local-only encrypted synthetic drill executes backup, restore, injected failure and rollback', async () => {
  const f = fixture(), d = fakeDocker();
  try {
    assert.deepEqual(await runLocalSyntheticRecovery(f.env, { socketCheck: () => true, runner: d.runner }),
      { result: 'local-synthetic-only' });
    assert.equal(d.calls.filter(x => x[0] === 'run').length, 3);
    assert.equal(d.calls.filter(x => x.includes('pg_restore')).length, 2);
    assert.equal(d.calls.filter(x => x[0] === 'rm').length, 3);
    assert.equal(d.states.size, 0);
    assert.ok(d.calls.filter(x => x[0] === 'run').every(x => !x.includes('--mount') && !x.includes('-v') && !x.includes('--network=host')));
    assert.ok(d.calls.filter(x => x[0] === 'run').every(x => x.includes('--network') && x.includes('none') && x.includes('--pull') && x.includes('never')));
    assert.equal(d.calls[0][0], 'image');
  } finally { f.cleanup(); }
});

test('S36 restore failure rejects and removes every disposable container', async () => {
  const f = fixture(), d = fakeDocker({ failRestore: true });
  try {
    await assert.rejects(runLocalSyntheticRecovery(f.env, { socketCheck: () => true, runner: d.runner }), /Docker operation failed/);
    assert.equal(d.states.size, 0);
    assert.equal(d.calls.filter(x => x[0] === 'rm').length, 2);
  } finally { f.cleanup(); }
});

test('S36 refuses remote Docker daemon, production credentials and remote storage', () => {
  const f = fixture();
  try {
    assert.equal(validateLocalRecoveryEnv(f.env).image, image);
    for (const change of [
      { DOCKER_HOST: 'tcp://production:2376' }, { DOCKER_CONTEXT: 'production' },
      { DATABASE_URL: 'postgres://production' }, { PGHOST: 'production' },
      { AWS_PROFILE: 'production' }, { AWS_ENDPOINT_URL: 'http://localhost:9000' },
      { EPMO_RECOVERY_S3_PREFIX: 's3://bucket/epmo-synthetic-drills/a' },
      { EPMO_REMOTE_IO_APPROVED: 'YES' }, { DEPLOYMENT_ENV: 'production' },
      { EPMO_SYNTHETIC_ONLY: 'NO' }, { EPMO_LOCAL_DRILL_APPROVED: 'NO' },
      { EPMO_PG_IMAGE: 'postgres:16-alpine' },
    ]) assert.throws(() => validateLocalRecoveryEnv({ ...f.env, ...change }), JSON.stringify(change));
    chmodSync(f.keyFile, 0o644);
    assert.throws(() => validateLocalRecoveryEnv(f.env));
  } finally { f.cleanup(); }
});

test('S36 refuses missing local Docker socket before any Docker command', async () => {
  const f = fixture(), d = fakeDocker();
  try {
    await assert.rejects(runLocalSyntheticRecovery(f.env, { socketCheck: () => false, runner: d.runner }), /local.*socket/);
    assert.equal(d.calls.length, 0);
  } finally { f.cleanup(); }
});

test('S36 saved backup is owner-only encrypted and tampering blocks restore', async () => {
  const f = fixture(), d = fakeDocker();
  try {
    await assert.rejects(runLocalSyntheticRecovery(f.env, {
      socketCheck: () => true, runner: d.runner,
      inspectSealed: path => {
        assert.equal(statSync(path).mode & 0o077, 0);
        const sealed = readFileSync(path);
        assert.ok(sealed.subarray(0, 8).equals(Buffer.from('EPMOS34\0')));
        assert.equal(sealed.includes(Buffer.from('S36_SYNTHETIC_ORIGINAL')), false);
        sealed[sealed.length - 1] ^= 1;
        writeFileSync(path, sealed);
      },
    }));
    assert.equal(d.calls.filter(x => x.includes('pg_restore')).length, 0);
    assert.equal(d.states.size, 0);
  } finally { f.cleanup(); }
});

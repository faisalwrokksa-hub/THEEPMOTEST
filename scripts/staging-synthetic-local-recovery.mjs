#!/usr/bin/env node
/** S36: opt-in local Docker-only synthetic PostgreSQL recovery rehearsal.
 * No provider, network, production database, DNS or S3 operations. This is NOT
 * off-host backup acceptance or staging/production disaster recovery evidence.
 */
import { createHash, randomBytes } from 'node:crypto';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, lstatSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join, isAbsolute, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { encryptArchive, decryptArchive } from './staging-synthetic-recovery.mjs';

const checkout = resolve(fileURLToPath(new URL('../', import.meta.url)));
const SOCKET = '/var/run/docker.sock';
const sha256 = b => createHash('sha256').update(b).digest('hex');
const expected = '1|S36_SYNTHETIC_ORIGINAL\n2|S36_SYNTHETIC_SECOND';
const selectSql = 'SELECT id,marker FROM epmo_s36_fixture ORDER BY id';
const seedSql = "CREATE TABLE epmo_s36_fixture (id integer PRIMARY KEY, marker text NOT NULL);\n" +
  "INSERT INTO epmo_s36_fixture VALUES (1,'S36_SYNTHETIC_ORIGINAL'),(2,'S36_SYNTHETIC_SECOND');\n";

export function validateLocalRecoveryEnv(env, root = checkout) {
  if (env.DEPLOYMENT_ENV !== 'staging' || env.EPMO_SYNTHETIC_ONLY !== 'YES' ||
      env.EPMO_LOCAL_DRILL_APPROVED !== 'YES' || env.EPMO_REMOTE_IO_APPROVED === 'YES')
    throw new Error('Local synthetic-only staging approval is required; remote I/O must remain disabled');
  const forbidden = ['DATABASE_URL', 'REDIS_URL', 'STRIPE_SECRET_KEY', 'MS_CLIENT_SECRET',
    'DOCKER_HOST', 'DOCKER_CONTEXT', 'DOCKER_CONFIG', 'DOCKER_TLS_VERIFY', 'DOCKER_CERT_PATH',
    'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_SESSION_TOKEN', 'AWS_PROFILE',
    'AWS_SHARED_CREDENTIALS_FILE', 'AWS_CONFIG_FILE', 'AWS_ENDPOINT_URL', 'AWS_ENDPOINT_URL_S3',
    'EPMO_RECOVERY_S3_PREFIX'];
  if (forbidden.some(k => Boolean(env[k])) ||
      Object.keys(env).some(k => /^PG[A-Z_]+$/.test(k) && Boolean(env[k])))
    throw new Error('Refusing ambient production, provider, database or Docker routing settings');
  if (!/^postgres:16(?:\.[0-9]+)?-alpine@sha256:[a-f0-9]{64}$/.test(env.EPMO_PG_IMAGE || ''))
    throw new Error('Use an independently approved immutable PostgreSQL 16 Alpine image digest');
  const path = env.EPMO_LOCAL_DRILL_KEY_FILE;
  if (!path || !isAbsolute(path)) throw new Error('Encryption key must have an absolute path');
  const st = lstatSync(path);
  const real = realpathSync(path);
  if (!st.isFile() || (st.mode & 0o077) !== 0 || real === root || real.startsWith(root + sep))
    throw new Error('Encryption key must be a regular owner-only file outside the checkout');
  const key = readFileSync(real);
  if (key.length !== 32) throw new Error('Encryption key must contain 32 random bytes');
  return { key, image: env.EPMO_PG_IMAGE };
}

export function isLocalDockerSocket(path = SOCKET) {
  try { return lstatSync(path).isSocket(); } catch { return false; }
}

/** Injection is for dependency-free regression tests, never for the CLI path. */
export async function runLocalSyntheticRecovery(env = process.env, deps = {}) {
  const { key, image } = validateLocalRecoveryEnv(env);
  if (!(deps.socketCheck || isLocalDockerSocket)(SOCKET))
    throw new Error('A local, non-symlink Unix Docker socket is required');
  const runner = deps.runner || spawnSync;
  function docker(args, input, timeout = 90_000) {
    const res = runner('docker', ['--host', 'unix://' + SOCKET, ...args], {
      input, timeout, maxBuffer: 16 * 1024 * 1024,
      env: { PATH: process.env.PATH || '/usr/bin:/bin', HOME: '/nonexistent' },
    });
    if (res.error || res.signal || res.status !== 0)
      throw new Error('Local Docker operation failed; details withheld');
    return Buffer.isBuffer(res.stdout) ? res.stdout : Buffer.from(res.stdout || '');
  }
  const name = () => 'epmo-s36-' + randomBytes(9).toString('hex');
  const active = [];
  const dir = mkdtempSync(join(tmpdir(), 'epmo-s36-'));
  let plain;
  try {
    // Must already be present: never pull an unreviewed image or contact a registry.
    docker(['image', 'inspect', image]);
    async function start() {
      const id = name(); active.push(id);
      docker(['run', '--pull', 'never', '--rm', '-d', '--network', 'none',
        '--name', id, '--memory', '768m', '--pids-limit', '128',
        '--tmpfs', '/var/lib/postgresql/data:rw,nosuid,size=256m',
        '--tmpfs', '/var/run/postgresql:rw,nosuid,size=16m',
        '--tmpfs', '/tmp:rw,nosuid,size=32m',
        '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', image]);
      for (let i = 0; i < 45; i++) {
        try { docker(['exec', id, 'pg_isready', '-U', 'postgres'], undefined, 4000); return id; }
        catch { if (i === 44) break; await new Promise(r => setTimeout(r, 1000)); }
      }
      throw new Error('Disposable PostgreSQL did not become ready');
    }
    const query = id => docker(['exec', id, 'psql', '-X', '-A', '-t', '-v', 'ON_ERROR_STOP=1',
      '-U', 'postgres', '-d', 'postgres', '-c', selectSql]).toString().trim();
    const restore = (id, archive) => {
      docker(['exec', '-i', id, 'pg_restore', '--exit-on-error', '--single-transaction',
        '--no-owner', '--no-acl', '-U', 'postgres', '-d', 'postgres'], archive);
      if (query(id) !== expected) throw new Error('Restored synthetic data mismatch');
    };
    const source = await start();
    docker(['exec', '-i', source, 'psql', '-X', '-v', 'ON_ERROR_STOP=1',
      '-U', 'postgres', '-d', 'postgres'], Buffer.from(seedSql));
    if (query(source) !== expected) throw new Error('Synthetic source mismatch');
    plain = docker(['exec', source, 'pg_dump', '-Fc', '-U', 'postgres', '-d', 'postgres']);
    if (plain.length < 100 || !plain.subarray(0, 5).equals(Buffer.from('PGDMP')))
      throw new Error('Missing valid PostgreSQL custom archive');
    const sealedPath = join(dir, 'local-synthetic.pgdump.aes256gcm');
    writeFileSync(sealedPath, encryptArchive(plain, key), { flag: 'wx', mode: 0o600 });
    if (deps.inspectSealed) deps.inspectSealed(sealedPath); // test-only fault injection
    const sealed = readFileSync(sealedPath);
    if (sealed.includes(Buffer.from('S36_SYNTHETIC_ORIGINAL')))
      throw new Error('Unencrypted fixture marker in saved archive');
    const recovered = decryptArchive(sealed, key);
    if (sha256(recovered) !== sha256(plain)) throw new Error('Decrypted archive checksum mismatch');
    const target = await start();
    restore(target, recovered);
    docker(['exec', target, 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres',
      '-d', 'postgres', '-c', "UPDATE epmo_s36_fixture SET marker='S36_SYNTHETIC_FAILED' WHERE id=1"]);
    if (query(target) === expected) throw new Error('Failure injection did not alter data');
    const rollback = await start();
    restore(rollback, recovered);
    console.log('PASS: LOCAL-ONLY synthetic encrypted backup, disposable restore, failure and rollback');
    console.log('NOT ACCEPTED: off-host storage, public staging, real tenant isolation or production recovery');
    return { result: 'local-synthetic-only' };
  } finally {
    for (const id of active.reverse()) {
      try { docker(['rm', '-f', id], undefined, 15_000); } catch { /* cleanup best effort */ }
    }
    if (plain) plain.fill(0);
    rmSync(dir, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 2) { console.error('Usage: node scripts/staging-synthetic-local-recovery.mjs'); process.exitCode = 2; }
  else runLocalSyntheticRecovery().catch(() => {
    console.error('BLOCKED: local synthetic recovery failed; no external acceptance claimed');
    process.exitCode = 1;
  });
}

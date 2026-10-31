#!/usr/bin/env node
/** S34: opt-in, synthetic-only PostgreSQL backup/restore/rollback rehearsal.
 * Uses disposable, networkless Docker containers; never connects to staging or production DB.
 * Uploads an authenticated encrypted archive to an explicitly approved S3 prefix.
 * Does NOT prove real staging recovery, remote region, public HTTPS or commercial GO.
 */
import { randomBytes, createCipheriv, createDecipheriv, createHash } from 'node:crypto';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, statSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join, isAbsolute, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { assertSyntheticRecoveryRuntime, isolatedDockerCommand, isolatedAwsEnvironment } from './staging-recovery-runtime-boundary.mjs';

const MAGIC = Buffer.from('EPMOS34\0');
const AAD = Buffer.from('epmo:synthetic:postgres:recovery:v1');
const sha256 = data => createHash('sha256').update(data).digest('hex');
const sourceRoot = resolve(fileURLToPath(new URL('../', import.meta.url)));

export function parseRemote(uri) {
  const m = /^s3:\/\/([a-z0-9][a-z0-9.-]{2,62})\/(epmo-synthetic-drills\/[a-zA-Z0-9/_-]{1,120})\/?$/.exec(uri || '');
  if (!m || m[1].includes('..') || m[2].includes('..') || m[2].includes('//'))
    throw new Error('S3 destination must use a dedicated epmo-synthetic-drills/ prefix');
  return { bucket: m[1], prefix: m[2].replace(/\/$/, '') };
}

export function validateDrillEnvironment(env) {
  if (env.DEPLOYMENT_ENV !== 'staging' || env.EPMO_SYNTHETIC_ONLY !== 'YES' ||
      env.EPMO_REMOTE_IO_APPROVED !== 'YES')
    throw new Error('Explicit staging/synthetic/remote-I/O authorization flags are required');
  for (const name of ['DATABASE_URL', 'PGHOST', 'PGDATABASE', 'PGPASSWORD', 'STRIPE_SECRET_KEY',
    'MS_CLIENT_SECRET', 'AWS_ENDPOINT_URL', 'AWS_ENDPOINT_URL_S3']) {
    if (env[name]) throw new Error('Refusing ambient ' + name + ' for a synthetic-only drill');
  }
  if (!/^postgres:16(?:\.[0-9]+)?-alpine@sha256:[a-f0-9]{64}$/.test(env.EPMO_PG_IMAGE || ''))
    throw new Error('Pin an independently approved postgres:16-alpine image digest');
  const remote = parseRemote(env.EPMO_RECOVERY_S3_PREFIX);
  const path = env.EPMO_RECOVERY_KEY_FILE || '';
  if (!isAbsolute(path)) throw new Error('Encryption key must be an absolute file path');
  const real = realpathSync(path);
  if (real === sourceRoot || real.startsWith(sourceRoot + sep))
    throw new Error('Encryption key must remain outside the source checkout');
  const stat = statSync(real);
  if (!stat.isFile() || (stat.mode & 0o077) !== 0)
    throw new Error('Encryption key must be an owner-only regular file');
  const key = readFileSync(real);
  if (key.length !== 32) throw new Error('Encryption key file must contain exactly 32 random bytes');
  return { key, image: env.EPMO_PG_IMAGE, remote };
}

export function encryptArchive(plain, key, nonce = randomBytes(12)) {
  if (!Buffer.isBuffer(plain) || !Buffer.isBuffer(key) || key.length !== 32 || nonce.length !== 12)
    throw new Error('Invalid archive, key or nonce');
  const cipher = createCipheriv('aes-256-gcm', key, nonce);
  cipher.setAAD(AAD);
  const body = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([MAGIC, nonce, cipher.getAuthTag(), body]);
}
export function decryptArchive(sealed, key) {
  if (!Buffer.isBuffer(sealed) || !Buffer.isBuffer(key) || key.length !== 32 ||
      sealed.length < MAGIC.length + 12 + 16 || !sealed.subarray(0, MAGIC.length).equals(MAGIC))
    throw new Error('Invalid encrypted synthetic archive');
  const n = MAGIC.length;
  const decipher = createDecipheriv('aes-256-gcm', key, sealed.subarray(n, n + 12));
  decipher.setAAD(AAD);
  decipher.setAuthTag(sealed.subarray(n + 12, n + 28));
  return Buffer.concat([decipher.update(sealed.subarray(n + 28)), decipher.final()]);
}

function execSafe(bin, args, opts = {}) {
  const result = spawnSync(bin, args, { input: opts.input, timeout: opts.timeout || 90_000,
    maxBuffer: 16 * 1024 * 1024, env: opts.env || process.env });
  if (result.error || result.status !== 0 || result.signal)
    throw new Error(bin + ' operation failed (details withheld; no secrets logged)');
  return result.stdout;
}
function makeIsolatedClients(env) {
  // Resolve explicit TEST credentials before starting disposable containers.
  const awsEnv = isolatedAwsEnvironment(env);
  const docker = (args, opts = {}) => {
    const command = isolatedDockerCommand(args, env);
    return execSafe('docker', command.args, { ...opts, env: command.env });
  };
  const aws = args => execSafe('aws', args, { env: awsEnv });
  return { docker, aws };
}
const sql = "CREATE TABLE epmo_synthetic_recovery (id integer PRIMARY KEY, marker text NOT NULL);\n" +
  "INSERT INTO epmo_synthetic_recovery VALUES (1,'S34_SYNTHETIC_A'),(2,'S34_SYNTHETIC_B');\n";
const expected = '1|S34_SYNTHETIC_A\n2|S34_SYNTHETIC_B';
const verifySql = 'SELECT id,marker FROM epmo_synthetic_recovery ORDER BY id';
const container = () => 'epmo-s34-' + randomBytes(9).toString('hex');

async function startContainer(name, image, docker) {
  docker(['run', '--pull', 'never', '--rm', '-d', '--network', 'none',
    '--memory', '768m', '--pids-limit', '128', '--name', name,
    '--tmpfs', '/var/lib/postgresql/data:rw,nosuid,size=256m',
    '--tmpfs', '/var/run/postgresql:rw,nosuid,size=16m',
    '--tmpfs', '/tmp:rw,nosuid,size=32m',
    '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', image]);
  for (let i = 0; i < 45; i++) {
    try { docker(['exec', name, 'pg_isready', '-U', 'postgres'], { timeout: 4000 }); return; }
    catch { /* disposable PostgreSQL has not become ready yet */ }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  throw new Error('Disposable PostgreSQL did not become ready');
}
const query = (name, docker) => docker(['exec', name, 'psql', '-X', '-A', '-t', '-v', 'ON_ERROR_STOP=1',
  '-U', 'postgres', '-d', 'postgres', '-c', verifySql]).toString().trim();
function restore(name, archive, docker) {
  docker(['exec', '-i', name, 'pg_restore', '--exit-on-error', '--single-transaction',
    '--no-owner', '--no-acl', '-U', 'postgres', '-d', 'postgres'], { input: archive });
  if (query(name, docker) !== expected) throw new Error('Synthetic restored rows do not match fixture');
}

export async function runSyntheticDrill(env = process.env, deps = {}) {
  const { key, image, remote } = validateDrillEnvironment(env);
  // Dependency injection is for non-networked regression fixtures; CLI never passes deps.
  assertSyntheticRecoveryRuntime(env, deps.socketCheck);
  const { docker, aws } = makeIsolatedClients(env);
  const id = randomBytes(12).toString('hex');
  const objectKey = remote.prefix + '/' + id + '.pgdump.aes256gcm';
  const url = 's3://' + remote.bucket + '/' + objectKey;
  const dir = mkdtempSync(join(tmpdir(), 'epmo-s34-'));
  const encrypted = join(dir, 'synthetic.pg.enc');
  const downloaded = join(dir, 'remote.pg.enc');
  const active = [];
  try {
    // Never pull from a registry during a synthetic drill: approved digest must already exist.
    docker(['image', 'inspect', image]);
    const source = container(); active.push(source);
    await startContainer(source, image, docker);
    docker(['exec', '-i', source, 'psql', '-X', '-v', 'ON_ERROR_STOP=1',
      '-U', 'postgres', '-d', 'postgres'], { input: Buffer.from(sql) });
    if (query(source, docker) !== expected) throw new Error('Synthetic fixture failed verification');
    const dump = docker(['exec', source, 'pg_dump', '-Fc', '-U', 'postgres', '-d', 'postgres']);
    if (dump.length < 100) throw new Error('Synthetic PostgreSQL dump is empty');
    writeFileSync(encrypted, encryptArchive(dump, key), { flag: 'wx', mode: 0o600 });
    aws(['s3', 'cp', encrypted, url, '--only-show-errors']);
    aws(['s3api', 'head-object', '--bucket', remote.bucket, '--key', objectKey]);
    aws(['s3', 'cp', url, downloaded, '--only-show-errors']);
    const remoteCopy = readFileSync(downloaded);
    if (sha256(remoteCopy) !== sha256(readFileSync(encrypted)))
      throw new Error('Encrypted object-store round-trip checksum mismatch');
    const restoredDump = decryptArchive(remoteCopy, key);
    if (sha256(restoredDump) !== sha256(dump))
      throw new Error('Authenticated archive integrity mismatch');
    const target = container(); active.push(target);
    await startContainer(target, image, docker);
    restore(target, restoredDump, docker);
    docker(['exec', target, 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres',
      '-d', 'postgres', '-c', "UPDATE epmo_synthetic_recovery SET marker='S34_SYNTHETIC_CORRUPTED' WHERE id=1"]);
    if (query(target, docker) === expected) throw new Error('Failure injection did not change the restored data');
    const rollback = container(); active.push(rollback);
    await startContainer(rollback, image, docker);
    restore(rollback, restoredDump, docker);
    console.log('PASS: synthetic-only encrypted S3 round-trip, isolated restore and disposable rollback rehearsal');
    console.log('NOT ACCEPTED: real staging restore, off-host region, public HTTPS or production recovery');
    return { objectKey, result: 'synthetic-drill-only' };
  } finally {
    for (const name of active.reverse()) {
      try { docker(['rm', '-f', name], { timeout: 15_000 }); } catch { /* best effort cleanup */ }
    }
    rmSync(dir, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 2) { console.error('Usage: node scripts/staging-synthetic-recovery.mjs'); process.exitCode = 2; }
  else runSyntheticDrill().catch(() => { console.error('BLOCKED: synthetic drill failed; no acceptance claimed. Check private operator logs.'); process.exitCode = 1; });
}

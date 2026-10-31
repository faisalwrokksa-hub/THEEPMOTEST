#!/usr/bin/env node
/**
 * P0: a REAL custom-format PostgreSQL backup/restore rehearsal in disposable CI.
 * Intentionally unavailable on hosts that could contain customer data.
 * Runs after migrations + demo seed and before starting the API (stable snapshot).
 */
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { verifyRepositoryMigrations } from './verify-migration-chain.mjs';

export const DISPOSABLE_ACK = 'YES_RESEED_DISPOSABLE_TEST_DATABASE';
const LOCALHOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/** Assert ALL constraints before any pg_dump/createdb/dropdb subprocess. */
export function disposableRestoreConfig(env) {
  if (env.CI !== 'true' || env.GITHUB_ACTIONS !== 'true' || env.NODE_ENV !== 'test' ||
      (env.DEPLOYMENT_ENV && env.DEPLOYMENT_ENV !== 'development') ||
      env.PHASE15_ACCEPT_DISPOSABLE_DB !== DISPOSABLE_ACK)
    throw new Error('Blocked: this restore drill is only for an explicitly acknowledged disposable GitHub CI database');
  const parse = (value, label) => {
    let u;
    try { u = new URL(value || ''); } catch { throw new Error(`${label}: invalid URL`); }
    if (!['postgres:', 'postgresql:'].includes(u.protocol) || !LOCALHOSTS.has(u.hostname) ||
        u.port !== '5433' || u.pathname !== '/pmo' || !u.username || !u.password ||
        u.search || u.hash)
      throw new Error(`${label}: must be the disposable PostgreSQL pmo database on local port 5433`);
    return u;
  };
  const admin = parse(env.DATABASE_URL_ADMIN, 'DATABASE_URL_ADMIN');
  const app = parse(env.DATABASE_URL, 'DATABASE_URL');
  if (admin.username !== 'postgres' || app.username !== 'pmo_app' ||
      admin.hostname !== app.hostname || admin.port !== app.port || admin.pathname !== app.pathname)
    throw new Error('Blocked: both CI URLs must target the same local database with the expected restricted/admin roles');
  return { host: admin.hostname === '[::1]' ? '::1' : admin.hostname,
    port: admin.port, database: 'pmo', user: 'postgres', password: decodeURIComponent(admin.password) };
}

/** SQL uses fixed table names only; no identifiers are derived from user input. */
export const DATA_CHECK_SQL = `SELECT json_build_object(
 'users',(SELECT count(*) FROM public.users),
 'tenants',(SELECT count(*) FROM public.tenants),
 'memberships',(SELECT count(*) FROM public.memberships),
 'migrations',(SELECT count(*) FROM public.schema_migrations),
 'invoices',(SELECT count(*) FROM public.billing_invoices),
 'reset_tokens',(SELECT count(*) FROM public.auth_password_resets)
)::text`;

export function runRestoreDrill(env = process.env) {
  const cfg = disposableRestoreConfig(env);
  // Match the exact pinned SQL migration inventory, never a stale fixed count.
  // The source must already have executed every migration before any backup.
  const expectedMigrations = verifyRepositoryMigrations().count;
  const scratch = mkdtempSync(join(tmpdir(), 'epmo-ci-restore-'));
  const archive = join(scratch, 'seeded.dump');
  const destination = `epmo_restore_ci_${randomBytes(10).toString('hex')}`;
  // Do not inherit arbitrary libpq settings from the runner. In particular,
  // PGHOSTADDR can redirect a connection even when a safe -h localhost is
  // specified, defeating the source/destination host checks above.
  const childEnv = {
    PATH: env.PATH || '/usr/bin:/bin', HOME: env.HOME || tmpdir(),
    LANG: env.LANG || 'C',
    PGHOST: cfg.host, PGPORT: cfg.port, PGUSER: cfg.user,
    PGPASSWORD: cfg.password, PGDATABASE: cfg.database, PGCONNECT_TIMEOUT: '10',
  };
  let created = false;
  const exec = (cmd, args, timeout = 180_000) => {
    const result = spawnSync(cmd, args, { env: childEnv, encoding: 'utf8', timeout, maxBuffer: 1024 * 1024 });
    if (result.error || result.status !== 0)
      throw new Error(`${cmd} failed (status=${result.status ?? 'unknown'}); see restricted CI PostgreSQL diagnostics`);
    return result.stdout.trim();
  };
  const args = ['-h', cfg.host, '-p', cfg.port, '-U', cfg.user];
  const counts = db => JSON.parse(exec('psql', [...args, '-X', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-d', db, '-c', DATA_CHECK_SQL]));
  let error;
  try {
    const before = counts(cfg.database);
    if (Number(before.users) < 2 || Number(before.tenants) < 2 ||
        Number(before.memberships) < 2 || Number(before.migrations) !== expectedMigrations)
      throw new Error('Blocked: CI source has not been migrated and seeded with the expected fixtures');
    exec('pg_dump', [...args, '-d', cfg.database, '--format=custom', '--no-owner', '--no-acl', '--file', archive]);
    if (statSync(archive).size < 100) throw new Error('Blocked: database backup is empty');
    exec('pg_restore', ['--list', archive]);
    exec('createdb', [...args, '--', destination]);
    created = true;
    // Exercise the same guarded CLI used for nonproduction recovery; no credentials in argv.
    // The child environment is constructed from validated CI-only settings, never inherited.
    const restoreUrl = new URL(env.DATABASE_URL_ADMIN);
    restoreUrl.pathname = '/' + destination;
    const cliEnv = {
      PATH: childEnv.PATH, HOME: childEnv.HOME, LANG: childEnv.LANG,
      PGCONNECT_TIMEOUT: '10', BACKUP_FILE: archive,
      RESTORE_DATABASE_URL: restoreUrl.toString(), ALLOW_DISPOSABLE_RESTORE: 'YES',
    };
    const cli = spawnSync('bash', ['scripts/verify-disposable-postgres-restore.sh'], {
      env: cliEnv, encoding: 'utf8', timeout: 180_000, maxBuffer: 1024 * 1024,
    });
    if (cli.error || cli.status !== 0)
      throw new Error('Guarded disposable restore CLI failed; see restricted CI diagnostics');
    const after = counts(destination);
    if (JSON.stringify(after) !== JSON.stringify(before))
      throw new Error('Blocked: restored row counts differ from the CI source snapshot');
    exec('psql', [...args, '-X', '-v', 'ON_ERROR_STOP=1', '-d', destination, '-c',
      'SET CONSTRAINTS ALL IMMEDIATE; SELECT 1;']);
    console.log('PASS: disposable PostgreSQL custom backup restored into an isolated database; core table counts matched');
  } catch (e) { error = e; }
  finally {
    if (created) {
      try { exec('dropdb', [...args, '--if-exists', '--', destination]); }
      catch { error = new Error(`Blocked: could not clean up isolated database ${destination}`); }
    }
    rmSync(scratch, { recursive: true, force: true });
  }
  if (error) throw error;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try { runRestoreDrill(); } catch (e) { console.error(e.message); process.exitCode = 1; }
}

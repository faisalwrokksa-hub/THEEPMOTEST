#!/usr/bin/env node
/** Fail-closed preflight for disposable GitHub Actions PostgreSQL + Redis. */
import { connect } from 'node:net';
import { pathToFileURL } from 'node:url';

export function validateCiServicesEnv(env) {
  const errors = [];
  if (env.CI !== 'true' || env.GITHUB_ACTIONS !== 'true' || env.NODE_ENV !== 'test')
    errors.push('Disposable CI context required');
  if (env.PHASE15_ACCEPT_DISPOSABLE_DB !== 'YES_RESEED_DISPOSABLE_TEST_DATABASE')
    errors.push('Explicit disposable database acknowledgement required');
  const checkUrl = (name, protocol, role, port, path) => {
    try {
      const parsed = new URL(env[name] || '');
      if (parsed.protocol !== protocol || !['localhost', '127.0.0.1'].includes(parsed.hostname) ||
        parsed.port !== port || (path && parsed.pathname !== path) ||
        (role && parsed.username !== role) || !parsed.password && role || parsed.search || parsed.hash)
        throw new Error('invalid target');
    } catch { errors.push(`${name} must target the expected disposable local CI service`); }
  };
  checkUrl('DATABASE_URL', 'postgres:', 'pmo_app', '5433', '/pmo');
  checkUrl('DATABASE_URL_ADMIN', 'postgres:', 'postgres', '5433', '/pmo');
  checkUrl('REDIS_URL', 'redis:', '', '6380', '');
  return errors;
}

export function probeTcp(host, port, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const socket = connect({ host, port });
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => { socket.end(); resolve(); });
    socket.once('timeout', () => socket.destroy(new Error('timeout')));
    socket.once('error', reject);
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const errors = validateCiServicesEnv(process.env);
  if (errors.length) { for (const e of errors) console.error(`FAIL: ${e}`); process.exitCode = 1; }
  else {
    try {
      await Promise.all([probeTcp('127.0.0.1', 5433), probeTcp('127.0.0.1', 6380)]);
      console.log('PASS: disposable CI environment and PostgreSQL/Redis TCP listeners available (not authentication/RLS acceptance)');
    } catch { console.error('FAIL: CI database or Redis is not reachable on the expected loopback port'); process.exitCode = 1; }
  }
}

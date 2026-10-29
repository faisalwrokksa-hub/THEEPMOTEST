/** Only fresh, disposable local PostgreSQL may use Drizzle schema push.
 * Production/staging MUST use the checked SQL migrations and history ledger.
 * Dependency-free so the safety check runs before drizzle-kit is invoked.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSimpleEnvFile } from './rc1-release-gate.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export function evaluateDevSchemaPush(env) {
  const checks = [];
  checks.push(['Explicit destructive development opt-in', env.EPMO_ALLOW_LOCAL_SCHEMA_PUSH === 'YES_I_UNDERSTAND']);
  checks.push(['Development-only environment', ['development','dev'].includes(env.DEPLOYMENT_ENV)]);
  let localAdmin = false;
  try {
    const url = new URL(env.DATABASE_URL_ADMIN || '');
    localAdmin = ['postgres:','postgresql:'].includes(url.protocol) &&
      ['127.0.0.1','localhost'].includes(url.hostname) && url.port === '5433' &&
      url.pathname === '/pmo' && url.username === 'postgres' &&
      !url.search && !url.hash;
  } catch { /* fail closed */ }
  checks.push(['Only local disposable pmo database (postgres@localhost:5433/pmo)', localAdmin]);
  return checks.map(([name, passed]) => ({ name, passed: Boolean(passed) }));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let envFile = {};
  const path = resolve(root, '.env');
  if (existsSync(path)) {
    try { envFile = parseSimpleEnvFile(readFileSync(path, 'utf8')); }
    catch (error) { console.error(`BLOCKED: invalid development .env: ${error.message}`); process.exit(1); }
  }
  // Shell environment takes priority; opt-in must be explicit in the shell,
  // not preserved accidentally in a copied or committed .env file.
  const env = {...envFile, ...process.env, EPMO_ALLOW_LOCAL_SCHEMA_PUSH:process.env.EPMO_ALLOW_LOCAL_SCHEMA_PUSH};
  const checks = evaluateDevSchemaPush(env);
  for (const {name,passed} of checks) console.log(`${passed ? 'PASS' : 'BLOCKED'} ${name}`);
  if (checks.some(x=>!x.passed)) {
    console.error('Use SQL-ledger migrations for staging/production: npm run db:migrate.');
    process.exitCode=1;
  }
}

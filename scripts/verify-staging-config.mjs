#!/usr/bin/env node
/** Fail-closed, read-only validation. Do not print environment values or credentials. */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { isIP } from 'node:net';
import { parseSimpleEnvFile } from './rc1-release-gate.mjs';

function publicHttpsOrigin(value) {
  try {
    const u = new URL(value);
    return u.protocol === 'https:' && !u.username && !u.password && !u.search && !u.hash &&
      u.pathname === '/' && !u.port && u.hostname.includes('.') && !isIP(u.hostname.replace(/^\[|\]$/g, '')) &&
      !['localhost', '127.0.0.1'].includes(u.hostname) &&
      !u.hostname.endsWith('.local') && !u.hostname.endsWith('.internal') && !u.hostname.endsWith('.localhost');
  } catch { return false; }
}
function validSecret(value) {
  return typeof value === 'string' && value.length >= 24 &&
    !/replace|placeholder|example|changeme|password|secret|dummy|your_/i.test(value);
}
function dbUrl(value) {
  try {
    const u = new URL(value);
    return ['postgres:', 'postgresql:'].includes(u.protocol) && !!u.hostname &&
      !!u.username && validSecret(decodeURIComponent(u.password)) && !!u.pathname.slice(1);
  } catch { return false; }
}
export function checkStagingSecurity(env) {
  const checks = [
    ['Staging environment explicitly selected', env.DEPLOYMENT_ENV === 'staging'],
    ['Loopback-only web bind', (env.WEB_BIND || '') === '127.0.0.1'],
    ['Public HTTPS web origin', publicHttpsOrigin(env.WEB_ORIGIN)],
    ['Public HTTPS API origin', publicHttpsOrigin(env.PUBLIC_API_URL)],
    ['Distinct API and web origins', !!env.PUBLIC_API_URL && env.PUBLIC_API_URL !== env.WEB_ORIGIN],
    ['Database connection has non-placeholder credentials', dbUrl(env.DATABASE_URL)],
    ['Redis connection has non-placeholder password', (() => {try {const u=new URL(env.REDIS_URL);return ['redis:','rediss:'].includes(u.protocol) && validSecret(decodeURIComponent(u.password));}catch{return false;}})()],
    ['Stripe configuration never uses live key in staging', !String(env.STRIPE_SECRET_KEY || '').startsWith('sk_live_')],
    ['Reference billing webhook disabled', env.BILLING_REFERENCE_WEBHOOK_ENABLED !== 'true'],
    ['No production deployment mode', env.NODE_ENV !== 'development' && env.DEPLOYMENT_ENV !== 'production'],
  ];
  return checks.map(([name, passed]) => ({ name, passed }));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 4 || process.argv[2] !== '--env-file' || process.argv[3] !== '.env.staging')
      throw new Error('Usage: node scripts/verify-staging-config.mjs --env-file .env.staging');
    const env = parseSimpleEnvFile(readFileSync(process.argv[3], 'utf8'));
    const results = checkStagingSecurity(env);
    for (const r of results) console.log(`${r.passed ? 'PASS' : 'BLOCKED'} ${r.name}`);
    console.log(`${results.filter(r => r.passed).length}/${results.length} staging security checks passed (configuration-only)`);
    if (results.some(r => !r.passed)) process.exitCode = 1;
  } catch (error) {
    console.error('BLOCKED staging validation: file missing, unreadable, or invalid arguments');
    process.exitCode = 1;
  }
}

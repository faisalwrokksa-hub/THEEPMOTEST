#!/usr/bin/env node
/**
 * Offline staging TLS-edge preflight. Does not contact Docker, DNS, hosts,
 * Stripe, Microsoft, PostgreSQL, or any network. Never prints secret values.
 */
import { readFileSync, realpathSync, statSync } from 'node:fs';
import { X509Certificate, createPrivateKey, createPublicKey } from 'node:crypto';
import { resolve, isAbsolute, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSimpleEnvFile } from '../../scripts/rc1-release-gate.mjs';

const repoRoot = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const shaPattern = /^[0-9a-f]{40}$/i;
const portOk = value => /^[0-9]{4,5}$/.test(String(value)) &&
  Number(value) >= 1024 && Number(value) <= 65535;

export function stagingEdgeChecks(env) {
  const edgePort = env.STAGING_EDGE_HTTPS_PORT || '8443';
  const webPort = env.WEB_PORT || '3001';
  const cert = env.STAGING_TLS_CERT_PATH || '';
  const key = env.STAGING_TLS_KEY_PATH || '';
  return [
    ['Staging deployment selected', env.DEPLOYMENT_ENV === 'staging'],
    ['Staging web origin is exact HTTPS hostname', env.WEB_ORIGIN === 'https://staging.theepmo.com'],
    ['Staging API origin is exact HTTPS hostname', env.PUBLIC_API_URL === 'https://api-staging.theepmo.com'],
    ['Web is bound to loopback', env.WEB_BIND === '127.0.0.1'],
    ['TLS edge defaults to loopback-only', (env.STAGING_EDGE_BIND || '127.0.0.1') === '127.0.0.1'],
    ['Web port is non-privileged', portOk(webPort)],
    ['TLS edge port is non-privileged and distinct from web port',
      portOk(edgePort) && String(edgePort) !== String(webPort)],
    ['No live Stripe credentials', !/^(?:sk|rk)_live_/.test(String(env.STRIPE_SECRET_KEY || ''))],
    ['Development header authentication disabled', env.ALLOW_HEADER_AUTH !== 'true'],
    ['No production deployment selected', env.NODE_ENV !== 'development' && env.DEPLOYMENT_ENV !== 'production'],
    ['Certificate and key paths are distinct absolute paths',
      isAbsolute(cert) && isAbsolute(key) && cert !== key],
    ['No unreviewed source SHA override', !env.EPMO_ROLLBACK_SHA || shaPattern.test(env.EPMO_ROLLBACK_SHA)],
  ].map(([name, passed]) => ({ name, passed: Boolean(passed) }));
}

function isOutsideRepo(path, root) {
  return path !== root && !path.startsWith(root + sep);
}

/** Certificate and key are checked in memory; only check names are reported. */
export function tlsMaterialChecks(env, root = repoRoot, now = Date.now()) {
  const certPath = env.STAGING_TLS_CERT_PATH || '';
  const keyPath = env.STAGING_TLS_KEY_PATH || '';
  const checks = [];
  let cert, key;
  try {
    if (!isAbsolute(certPath) || !isAbsolute(keyPath)) throw new Error('absolute paths required');
    const certResolved = realpathSync(certPath);
    const keyResolved = realpathSync(keyPath);
    if (!isOutsideRepo(certResolved, resolve(root)) || !isOutsideRepo(keyResolved, resolve(root)))
      throw new Error('TLS material must not be inside repository checkout');
    const certStat = statSync(certResolved);
    const keyStat = statSync(keyResolved);
    if (!certStat.isFile() || !keyStat.isFile()) throw new Error('TLS material must be regular files');
    if ((keyStat.mode & 0o077) !== 0) throw new Error('Private key must be owner-readable only');
    checks.push({ name: 'TLS files exist outside the checkout with private key permissions', passed: true });
    cert = new X509Certificate(readFileSync(certResolved));
    // A matching public key is not a deployable TLS private key. Require an
    // actual parseable private key before comparing its derived public half.
    key = createPrivateKey(readFileSync(keyResolved));
  } catch {
    return [
      { name: 'TLS files exist outside the checkout with private key permissions', passed: false },
      { name: 'TLS certificate matches both staging hostnames', passed: false },
      { name: 'TLS certificate is valid for at least 24 hours', passed: false },
      { name: 'TLS private key matches the certificate', passed: false },
    ];
  }
  // Modern TLS clients require SANs. checkHost() alone may fall back to a
  // legacy CN wildcard when SAN is missing, giving false deployment readiness.
  const sanNames = new Set((cert.subjectAltName || '').split(/,\s*/));
  checks.push({ name: 'TLS certificate matches both staging hostnames',
    passed: sanNames.has('DNS:staging.theepmo.com') &&
      sanNames.has('DNS:api-staging.theepmo.com') &&
      Boolean(cert.checkHost('staging.theepmo.com')) &&
      Boolean(cert.checkHost('api-staging.theepmo.com')) });
  checks.push({ name: 'TLS certificate is valid for at least 24 hours',
    passed: Date.parse(cert.validFrom) <= now &&
      Date.parse(cert.validTo) > now + 24 * 60 * 60 * 1000 });
  checks.push({ name: 'TLS private key matches the certificate',
    passed: cert.publicKey.export({ type: 'spki', format: 'der' }).equals(
      createPublicKey(key).export({ type: 'spki', format: 'der' })) });
  return checks;
}

function main() {
  if (process.argv.length !== 4 || process.argv[2] !== '--env-file' ||
      process.argv[3] !== '.env.staging') {
    console.error('Usage: node infra/staging/preflight.mjs --env-file .env.staging');
    process.exitCode = 2;
    return;
  }
  try {
    const env = parseSimpleEnvFile(readFileSync('.env.staging', 'utf8'));
    const results = [...stagingEdgeChecks(env), ...tlsMaterialChecks(env)];
    for (const result of results)
      console.log((result.passed ? 'PASS ' : 'BLOCKED ') + result.name);
    console.log(results.filter(r => r.passed).length + '/' + results.length +
      ' offline staging-edge checks passed; no network or deployment performed.');
    if (results.some(r => !r.passed)) process.exitCode = 1;
  } catch {
    console.error('BLOCKED: staging environment file is missing or invalid (values withheld)');
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();

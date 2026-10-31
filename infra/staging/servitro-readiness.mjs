#!/usr/bin/env node
/** S35: offline, read-only synthetic Servitro staging configuration gate.
 * No DNS queries, Docker daemon operations, deployment, secret output or live acceptance.
 * Requires separately authorized staging provisioning and synthetic-only data.
 */
import { readFileSync, lstatSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { parseSimpleEnvFile } from '../../scripts/rc1-release-gate.mjs';
import { checkStagingSecurity } from '../../scripts/verify-staging-config.mjs';
import { stagingEdgeChecks, tlsMaterialChecks } from './preflight.mjs';
import { inspectResolvedStagingCompose } from './verify-resolved-compose.mjs';

const root = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const shaPattern = /^[a-f0-9]{40}$/;
const result = (name, passed) => ({ name, passed: Boolean(passed) });

export function approvedEdgeMounts(model, env, checkout = root) {
  const mounts = model?.services?.['staging-edge']?.volumes;
  const required = [
    ['/etc/nginx/conf.d/default.conf', resolve(checkout, 'infra/staging/nginx.conf')],
    ['/run/epmo-tls/tls.crt', env.STAGING_TLS_CERT_PATH],
    ['/run/epmo-tls/tls.key', env.STAGING_TLS_KEY_PATH],
  ];
  return Array.isArray(mounts) && mounts.length === required.length &&
    required.every(([target, source]) => typeof source === 'string' &&
      mounts.filter(m => m.type === 'bind' && m.read_only === true &&
        m.target === target && m.source === source).length === 1);
}

export function preflightReadiness(env, sha, tlsResults) {
  return [
    result('Synthetic staging mode explicitly selected', env.EPMO_SYNTHETIC_ONLY === 'YES'),
    result('Candidate SHA matches the staging environment', shaPattern.test(sha) && env.EPMO_DEPLOY_SHA === sha),
    result('No production or DNS approval implied', env.EPMO_PRODUCTION_DEPLOY_APPROVED !== 'YES' &&
      env.EPMO_DNS_CHANGE_APPROVED !== 'YES'),
    ...checkStagingSecurity(env), ...stagingEdgeChecks(env), ...tlsResults,
  ];
}

export function inspectReadiness(env, sha, model, tlsResults) {
  return [...preflightReadiness(env, sha, tlsResults),
    ...inspectResolvedStagingCompose(model, sha),
    result('TLS edge uses only exact staging certificate/key and reviewed nginx config',
      approvedEdgeMounts(model, env))];
}

/** Compose config is local-only; deliberately strip inherited Docker/Compose overrides. */
export function resolveComposeConfig({ cwd = root, runner = spawnSync } = {}) {
  const args = ['compose', '-f', 'docker-compose.prod.yml',
    '-f', 'infra/staging/images.compose.yml', '-f', 'infra/staging/edge.compose.yml',
    '-p', 'pmo-staging', '--env-file', '.env.staging', 'config', '--format', 'json'];
  const command = runner('docker', args, {
    cwd, env: { PATH: process.env.PATH || '/usr/bin:/bin' },
    encoding: 'utf8', timeout: 20_000, maxBuffer: 8 * 1024 * 1024,
  });
  if (command.error || command.status !== 0 || command.signal)
    throw new Error('Docker Compose config could not be resolved locally');
  try { return JSON.parse(command.stdout); }
  catch { throw new Error('Docker Compose returned invalid JSON'); }
}

function report(checks) {
  for (const check of checks) console.log((check.passed ? 'PASS ' : 'BLOCKED ') + check.name);
  return checks.every(check => check.passed);
}

function main() {
  const args = process.argv.slice(2);
  if (args.length !== 4 || args[0] !== '--env-file' || args[1] !== '.env.staging' ||
      args[2] !== '--candidate-sha' || !shaPattern.test(args[3])) {
    console.error('Usage: node infra/staging/servitro-readiness.mjs --env-file .env.staging --candidate-sha <40-lowercase-hex>');
    process.exitCode = 2; return;
  }
  try {
    const path = resolve(root, '.env.staging');
    const stat = lstatSync(path);
    if (!stat.isFile() || (stat.mode & 0o077) !== 0)
      throw new Error('Staging environment must be an owner-only regular file');
    const env = parseSimpleEnvFile(readFileSync(path, 'utf8'));
    const tls = tlsMaterialChecks(env);
    const first = preflightReadiness(env, args[3], tls);
    if (!report(first)) { process.exitCode = 1; return; }
    const model = resolveComposeConfig();
    const compose = [ ...inspectResolvedStagingCompose(model, args[3]),
      result('TLS edge uses only exact staging certificate/key and reviewed nginx config',
        approvedEdgeMounts(model, env)) ];
    if (!report(compose)) { process.exitCode = 1; return; }
    console.log('PASS: OFFLINE SYNTHETIC STAGING CONFIG ONLY — no DNS, public HTTPS, Docker runtime or recovery acceptance');
  } catch {
    console.error('BLOCKED: offline staging readiness could not be verified (details withheld)');
    process.exitCode = 1;
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();

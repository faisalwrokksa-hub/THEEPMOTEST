#!/usr/bin/env node
/**
 * Phase 16D: read-only, unauthenticated API smoke against the running staging
 * Compose API container. The host wrapper attests the container identity before
 * executing the in-container probe. No credentials or write requests are used.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { parseSimpleEnvFile } from './rc1-release-gate.mjs';

const containerIdPattern = /^[a-f\d]{12,64}$/i;
const protectedPaths = Object.freeze([
  '/api/v1/subscription/current',
  '/api/v1/subscription/history',
  '/api/v1/subscription/billing/invoices',
  '/api/v1/subscription/billing/payments',
  '/api/v1/subscription/billing/reconciliation',
  '/api/v1/platform/modules',
  '/api/v1/super-admin/plans',
  '/api/v1/super-admin/tenants',
]);

export function attestStagingApi(env, container, requestedId) {
  if (env?.DEPLOYMENT_ENV !== 'staging')
    throw new Error('API smoke may run only for DEPLOYMENT_ENV=staging');
  if (!containerIdPattern.test(requestedId || '') ||
      !String(container?.Id || '').startsWith(requestedId))
    throw new Error('API container identity did not match Docker inspection');
  const labels = container?.Config?.Labels || {};
  if (labels['com.docker.compose.project'] !== 'pmo-staging' ||
      labels['com.docker.compose.service'] !== 'api')
    throw new Error('API container must belong to pmo-staging/api');
  if (container?.State?.Running !== true || container?.State?.Health?.Status !== 'healthy')
    throw new Error('Staging API container is not healthy');
  const configured = new Set(container?.Config?.Env || []);
  for (const flag of ['NODE_ENV=production', 'ALLOW_HEADER_AUTH=false', 'DEPLOYMENT_ENV=staging']) {
    if (!configured.has(flag)) throw new Error(`Staging API requires ${flag}`);
  }
  // API must be reachable through Docker's private network only.
  const published = container?.NetworkSettings?.Ports?.['4000/tcp'];
  if (Array.isArray(published) && published.length > 0)
    throw new Error('Staging API port 4000 must not be published on the host');
  return true;
}

function ensureNoRedirect(response, label) {
  if ([301, 302, 303, 307, 308].includes(response.status))
    throw new Error(`${label}: unexpected redirect; an HTTP guard was not exercised`);
}

export async function verifyApiBoundary(fetchFn = fetch, origin = 'http://127.0.0.1:4000') {
  if (origin !== 'http://127.0.0.1:4000')
    throw new Error('API smoke must target the container-local API port');
  const checks = [];
  const request = async (path, headers = {}) => {
    const response = await fetchFn(`${origin}${path}`, {
      method: 'GET', headers, redirect: 'manual', signal: AbortSignal.timeout(10000),
    });
    ensureNoRedirect(response, path);
    return response;
  };
  const health = await request('/health');
  if (health.status !== 200) throw new Error(`API health returned HTTP ${health.status}`);
  const data = await health.json();
  if (data?.ok !== true || data?.service !== 'pmo-api')
    throw new Error('Unexpected API health response or wrong local service');
  checks.push('API health identity');
  for (const path of protectedPaths) {
    const response = await request(path);
    if (response.status !== 401)
      throw new Error(`${path}: expected HTTP 401 without a session, got ${response.status}`);
    checks.push(`${path} rejects anonymous access`);
  }
  // A forged development header must not bypass production-built staging auth.
  // Run against both tenant billing and vendor-only Super Admin paths.
  const forged = {
    'x-tenant-id': 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
    'x-user-id': 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb',
  };
  for (const path of ['/api/v1/subscription/billing/invoices', '/api/v1/super-admin/tenants']) {
    const response = await request(path, forged);
    if (response.status !== 401)
      throw new Error(`${path}: forged tenant/user headers bypassed authentication (HTTP ${response.status})`);
    checks.push(`${path} rejects forged headers`);
  }
  return { passed: true, checks };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === '--inside-api-container') {
    if (process.env.NODE_ENV !== 'production' || process.env.DEPLOYMENT_ENV !== 'staging' ||
        process.env.ALLOW_HEADER_AUTH !== 'false')
      throw new Error('In-container smoke requires production-built staging with header auth disabled');
    const result = await verifyApiBoundary();
    for (const label of result.checks) console.log(`PASS ${label}`);
    console.log(`PASS Phase 16D staging API security acceptance: ${result.checks.length} checks`);
    return;
  }
  if (args.length !== 4 || args[0] !== '--env-file' || args[1] !== '.env.staging' ||
      args[2] !== '--container' || !containerIdPattern.test(args[3]))
    throw new Error('Usage: node scripts/phase16d-verify-staging-api.mjs --env-file .env.staging --container CONTAINER_ID');
  const env = parseSimpleEnvFile(readFileSync(args[1], 'utf8'));
  const inspected = JSON.parse(execFileSync('docker', ['inspect', args[3]], {
    encoding: 'utf8', timeout: 10000, maxBuffer: 1024 * 1024,
  }));
  if (!Array.isArray(inspected) || inspected.length !== 1)
    throw new Error('Expected exactly one Docker container');
  attestStagingApi(env, inspected[0], args[3]);
  execFileSync('docker', [
    'exec', args[3], 'node', 'scripts/phase16d-verify-staging-api.mjs', '--inside-api-container',
  ], { stdio: 'inherit', timeout: 150000 });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(`BLOCKED Phase 16D staging API acceptance: ${error.message}`);
    process.exitCode = 1;
  });
}

#!/usr/bin/env node
/**
 * Phase 16C staging-only post-deploy acceptance.
 * Attests that the local HTTP endpoint belongs to the healthy Compose web
 * container in pmo-staging before running bilingual/authentication smoke tests.
 * Makes only unauthenticated GET requests to localhost; never mutates data.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSimpleEnvFile } from './rc1-release-gate.mjs';
import { verifyWebSmoke } from './phase15d-web-smoke.mjs';

const containerPattern = /^[a-f0-9]{12,64}$/i;

export function validateStagingTarget(env, container, expectedId) {
  if (env.DEPLOYMENT_ENV !== 'staging')
    throw new Error('Expected DEPLOYMENT_ENV=staging; production is not an authorized smoke target');
  if ((env.WEB_BIND || '127.0.0.1') !== '127.0.0.1')
    throw new Error('Staging web port must be bound to 127.0.0.1');
  const rawPort = env.WEB_PORT || '3000';
  if (!/^[0-9]{4,5}$/.test(rawPort) || Number(rawPort) < 1024 || Number(rawPort) > 65535)
    throw new Error('Staging WEB_PORT must be a valid non-privileged TCP port');
  if (!containerPattern.test(expectedId || ''))
    throw new Error('Expected a non-empty Docker container ID');
  if (!container || typeof container !== 'object' || !String(container.Id || '').startsWith(expectedId))
    throw new Error('Docker inspection did not match the requested container');
  if (container.Config?.Labels?.['com.docker.compose.project'] !== 'pmo-staging' ||
      container.Config?.Labels?.['com.docker.compose.service'] !== 'web')
    throw new Error('Container must belong to the pmo-staging web service');
  if (container.State?.Running !== true || container.State?.Health?.Status !== 'healthy')
    throw new Error('Staging web container is not running and healthy');
  const published = container.NetworkSettings?.Ports?.['3000/tcp'];
  if (!Array.isArray(published) || published.length !== 1 ||
      published[0]?.HostIp !== '127.0.0.1' || published[0]?.HostPort !== rawPort)
    throw new Error('Staging container port 3000 must map exactly to the configured localhost WEB_PORT');
  return `http://127.0.0.1:${rawPort}`;
}

export async function verifyStagingWeb(env, container, expectedId, fetchFn = fetch) {
  const localOrigin = validateStagingTarget(env, container, expectedId);
  const result = await verifyWebSmoke(localOrigin, fetchFn);
  return { ...result, localOrigin };
}

async function cli() {
  const args = process.argv.slice(2);
  if (args.length !== 4 || args[0] !== '--env-file' || args[2] !== '--container' ||
      args[1] !== '.env.staging' || !containerPattern.test(args[3]))
    throw new Error('Usage: node scripts/phase16c-verify-staging-web.mjs --env-file .env.staging --container CONTAINER_ID');
  const env = parseSimpleEnvFile(readFileSync(args[1], 'utf8'));
  const text = execFileSync('docker', ['inspect', args[3]], { encoding: 'utf8', timeout: 10000, maxBuffer: 1024 * 1024 });
  const inspected = JSON.parse(text);
  if (!Array.isArray(inspected) || inspected.length !== 1)
    throw new Error('Expected exactly one inspected container');
  const result = await verifyStagingWeb(env, inspected[0], args[3]);
  for (const name of result.checks) console.log(`PASS ${name}`);
  console.log(`PASS Phase 16C actual staging-web acceptance: ${result.checks.length} read-only HTTP checks`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  cli().catch(error => {
    console.error(`BLOCKED Phase 16C staging-web acceptance: ${error.message}`);
    process.exitCode = 1;
  });
}

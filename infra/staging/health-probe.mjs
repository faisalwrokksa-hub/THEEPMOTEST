#!/usr/bin/env node
/**
 * Read-only staging HTTP probe for an approved external monitor or systemd timer.
 * GET only; never sends cookies, tokens, or customer data. No deployment action.
 */
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const targets = Object.freeze([
  { name: 'staging API health identity', url: 'https://api-staging.theepmo.com/health', status: 200, kind: 'api' },
  { name: 'staging web login availability', url: 'https://staging.theepmo.com/login', status: 200, kind: 'web' },
  { name: 'anonymous billing endpoint is denied', url: 'https://api-staging.theepmo.com/api/v1/subscription/current', status: 401, kind: 'auth' },
]);

export async function checkStagingHealth(fetchFn = fetch) {
  const checks = [];
  for (const target of targets) {
    let passed = false;
    try {
      const response = await fetchFn(target.url, {
        method: 'GET',
        redirect: 'manual',
        headers: { accept: target.kind === 'api' ? 'application/json' : '*/*' },
        signal: AbortSignal.timeout(8000),
      });
      passed = response.status === target.status && !response.redirected;
      if (passed && target.kind === 'api') {
        const health = await response.json();
        passed = health?.ok === true && health?.service === 'pmo-api';
      }
      if (passed && target.kind === 'web') {
        const contentType = response.headers?.get('content-type') || '';
        passed = contentType.includes('text/html');
      }
    } catch {
      // Network details and response bodies are deliberately not logged.
    }
    checks.push({ name: target.name, passed });
  }
  return { passed: checks.every(check => check.passed), checkedAt: new Date().toISOString(), checks };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 3 || process.argv[2] !== '--once') {
    console.error('Usage: node infra/staging/health-probe.mjs --once');
    process.exitCode = 2;
  } else {
    const result = await checkStagingHealth();
    console.log(JSON.stringify(result));
    if (!result.passed) process.exitCode = 1;
  }
}

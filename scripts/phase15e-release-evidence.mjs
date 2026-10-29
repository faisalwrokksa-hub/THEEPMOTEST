#!/usr/bin/env node
/**
 * Phase 15E: fail-closed, per-run release evidence index.
 *
 * These receipts only attest that the CI step which created them exited 0;
 * they are NOT proof of a Stripe charge, human UAT, or production readiness.
 * The launch profile additionally requires three separate live checks and is
 * deliberately expected to FAIL in source-only environments.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const CI_GATES = Object.freeze([
  'packages_build', 'migrations_rls', 'db_restore', 'types', 'tenant_isolation',
  'billing_api', 'financial_rls', 'integration_tests', 'recovery_api', 'production_build', 'web_runtime',
]);
export const LAUNCH_GATES = Object.freeze([
  ...CI_GATES,
  'stripe_test_payment', 'ses_invitation_delivery', 'bilingual_browser_review',
  'microsoft_per_user_auth_live', 'staging_deployment_live', 'disaster_recovery_live',
]);
const ALL_GATES = new Set(LAUNCH_GATES);
const SHA = /^[a-f0-9]{40}$/i;
const RUN_ID = /^[1-9][0-9]{0,18}$/;

export function assertContext({ sha, runId }) {
  if (!SHA.test(sha || '') || !RUN_ID.test(String(runId || '')))
    throw new Error('Missing/invalid CI commit SHA or positive CI run ID; cannot claim release evidence');
  return { sha: sha.toLowerCase(), runId: String(runId) };
}
export function receiptFilename(gate) {
  if (!ALL_GATES.has(gate)) throw new Error(`Unknown release gate: ${gate}`);
  return `${gate}.json`;
}
export function makeReceipt(gate, context, at = new Date()) {
  receiptFilename(gate);
  const { sha, runId } = assertContext(context);
  if (!Number.isFinite(at.getTime())) throw new Error('Invalid evidence timestamp');
  return { schemaVersion: 1, gate, status: 'passed', sha, runId, timestamp: at.toISOString() };
}
export function recordGate(directory, gate, context) {
  const receipt = makeReceipt(gate, context);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  // Exclusive create: do not silently overwrite stale/replayed evidence.
  writeFileSync(join(directory, receiptFilename(gate)), JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  return receipt;
}

export function verifyReceipts(directory, profile, context, now = new Date(), read = readFileSync) {
  if (!['ci', 'launch'].includes(profile)) throw new Error('Expected profile ci or launch');
  const { sha, runId } = assertContext(context);
  if (!Number.isFinite(now.getTime())) throw new Error('Invalid verifier clock');
  const gates = profile === 'ci' ? CI_GATES : LAUNCH_GATES;
  const checks = gates.map(gate => {
    try {
      const receipt = JSON.parse(read(join(directory, receiptFilename(gate)), 'utf8'));
      const instant = Date.parse(receipt.timestamp);
      const valid = receipt.schemaVersion === 1 && receipt.gate === gate && receipt.status === 'passed' &&
        receipt.sha === sha && receipt.runId === runId &&
        Number.isFinite(instant) && instant <= now.getTime() + 60_000 &&
        instant >= now.getTime() - 24 * 60 * 60 * 1000;
      return { gate, passed: valid, reason: valid ? 'receipt verified' : 'invalid/stale/different-run receipt' };
    } catch {
      return { gate, passed: false, reason: 'receipt missing or malformed' };
    }
  });
  return { profile, passed: checks.every(c => c.passed), checks };
}

function cli() {
  const [action, target] = process.argv.slice(2);
  if (!['record','verify'].includes(action) || !target || process.argv.length !== 4)
    throw new Error('Usage: node scripts/phase15e-release-evidence.mjs record GATE | verify ci|launch');
  const directory = process.env.EPMO_EVIDENCE_DIR;
  if (!directory || !resolve(directory).startsWith(resolve(process.env.RUNNER_TEMP || '/nonexistent-ci-temp') + '/'))
    throw new Error('EPMO_EVIDENCE_DIR must reside under the CI runner temporary directory');
  if (process.env.CI !== 'true' || process.env.GITHUB_ACTIONS !== 'true')
    throw new Error('Release evidence can only be recorded or verified by CI');
  const context = { sha: process.env.GITHUB_SHA, runId: process.env.GITHUB_RUN_ID };
  if (action === 'record') {
    const receipt = recordGate(directory, target, context);
    console.log(`PASS: ${receipt.gate} recorded for this CI run`);
  } else {
    const result = verifyReceipts(directory, target, context);
    for (const { gate, passed, reason } of result.checks)
      console.log(`${passed ? 'PASS' : 'BLOCKED'} ${gate}: ${reason}`);
    console.log(`${target.toUpperCase()} evidence: ${result.checks.filter(c => c.passed).length}/${result.checks.length}`);
    if (!result.passed) process.exitCode = 1;
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { cli(); } catch (error) { console.error(`BLOCKED release evidence: ${error.message}`); process.exitCode = 1; }
}

#!/usr/bin/env node
/**
 * Offline, read-only commercial evidence consistency check.
 * Complete metadata means ready for independent provider review, never launch approval.
 */
import { readFileSync } from 'node:fs';
import { isIP } from 'node:net';
import { fileURLToPath } from 'node:url';

export const REQUIRED_GATES = Object.freeze([
  'dependency_security', 'ci_build_tests', 'tenant_rls',
  'microsoft_per_user_oauth', 'stripe_test_billing',
  'frontend_customer_journeys', 'staging_smoke',
  'backup_restore_rollback', 'support_legal',
]);
export const STRIPE_SCENARIOS = Object.freeze([
  'first_customer_subscription_checkout', 'webhook_signature_verified',
  'webhook_replay_idempotent', 'entitlement_activation',
  'failed_payment_access_policy', 'subscription_cancellation',
  'cross_tenant_billing_isolation',
]);
const SHA = /^[a-f0-9]{40}$/i;
// Release receipts must be stable, public review links, not loopback/private or fixture endpoints.
function publicEvidenceHost(hostname) {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  return host.includes('.') && !isIP(host) &&
    !/(?:^|\.)(?:localhost|local|internal|invalid|example|test|onion|arpa)$/.test(host) &&
    !/(?:^|\.)(?:example\.com|example\.net|example\.org)$/.test(host);
}
function validUrl(value) {
  try {
    const url = new URL(value);
    // Never store signed links, API keys or bearer credentials in release manifests.
    // Evidence URLs must remain reviewable without exposing a secret in the query string.
    const credentialQuery = [...url.searchParams.keys()].some(key =>
      /(?:^|[_-])(?:token|secret|password|api[_-]?key|signature|sig|authorization|credential)(?:$|[_-])/i.test(key));
    return url.protocol === 'https:' && publicEvidenceHost(url.hostname) && url.pathname !== '/' &&
      !url.username && !url.password && !url.hash && !credentialQuery &&
      !url.hostname.endsWith('.example') && !url.hostname.endsWith('.test');
  } catch { return false; }
}
function validTimestamp(value, now) {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/.test(value)) return false;
  const time = Date.parse(value);
  return Number.isFinite(time) && time <= now.getTime() + 300000;
}
function validReceipt(item, sha, now, withReviewer) {
  return item && item.status === 'PASS' && item.commitSha === sha &&
    item.testResult === 'PASS' && validUrl(item.artifactUrl) &&
    validTimestamp(item.executedAtUtc, now) &&
    (!withReviewer || (typeof item.reviewer === 'string' && item.reviewer.trim().length >= 2));
}
export function evaluateCommercialManifest(manifest, now = new Date()) {
  if (!manifest || manifest.schemaVersion !== 1 || !manifest.gates ||
      typeof manifest.gates !== 'object' || !Number.isFinite(now.getTime()))
    throw new Error('Invalid commercial release manifest');
  const sha = SHA.test(manifest.candidateSha || '') ? manifest.candidateSha : null;
  const blockers = [];
  let accepted = 0;
  for (const gate of REQUIRED_GATES) {
    const entry = manifest.gates[gate];
    const receiptOk = sha && validReceipt(entry, sha, now, true) &&
      (gate === 'stripe_test_billing' ? entry.mode === 'test' &&
        STRIPE_SCENARIOS.every(s => validReceipt(entry.scenarios?.[s], sha, now, false)) : true);
    if (receiptOk) accepted++;
    else blockers.push(gate);
  }
  const evidenceReady = Boolean(sha && accepted === REQUIRED_GATES.length);
  return {
    candidateSha: sha, accepted, total: REQUIRED_GATES.length,
    blockers, evidenceReady, decision: 'NO-GO',
    manifestDecisionConsistent: manifest.decision !== 'GO' || evidenceReady,
  };
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const path = process.argv[2] || new URL('../docs/commercial-release-evidence.json', import.meta.url);
    if (process.argv.length > 3) throw new Error('Usage: node scripts/verify-commercial-gates.mjs [manifest.json]');
    const result = evaluateCommercialManifest(JSON.parse(readFileSync(path, 'utf8')));
    console.log('THE EPMO commercial evidence: ' + result.accepted + '/' + result.total + '; decision NO-GO');
    for (const gate of result.blockers) console.log('BLOCKED ' + gate);
    if (result.evidenceReady) console.log('Evidence metadata complete; independent external review still required');
    if (!result.manifestDecisionConsistent) console.log('BLOCKED manifest incorrectly declares GO');
    process.exitCode = result.evidenceReady && result.manifestDecisionConsistent ? 0 : 1;
  } catch {
    console.error('BLOCKED commercial evidence: missing, malformed, or inconsistent manifest');
    process.exitCode = 1;
  }
}

/**
 * Read-only commercial release evidence gate. This validates completeness and
 * consistency of a signed evidence manifest; it does NOT execute or independently
 * authenticate tests. Never treat a PASS field alone as a successful test.
 */
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export const REQUIRED_GATES = Object.freeze([
  'dependency_security',
  'ci_build_tests',
  'tenant_rls',
  'microsoft_per_user_oauth',
  'stripe_test_billing',
  'frontend_customer_journeys',
  'staging_smoke',
  'backup_restore_rollback',
  'support_legal',
]);

export const REQUIRED_STRIPE_SCENARIOS = Object.freeze([
  "first_customer_subscription_checkout",
  "webhook_signature_verified",
  "webhook_replay_idempotent",
  "entitlement_activation",
  "failed_payment_access_policy",
  "subscription_cancellation",
  "cross_tenant_billing_isolation"
]);

const SHA = /^[a-f0-9]{40}$/i;
const MAX_EVIDENCE_AGE_MS = 72 * 60 * 60 * 1000;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;

function isSafeEvidenceUrl(value) {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname.includes('.') &&
      url.pathname.length > 1 && !url.username && !url.password && !url.hash &&
      ![...url.searchParams.keys()].some(key => /^(?:token|secret|password|key|signature|sig|session|code|authorization|credential|auth)$|(?:access[_-]?token|api[_-]?key|client[_-]?secret|auth[_-]?token|awsaccesskeyid|x[-_]amz[-_](?:signature|credential)|x[-_]goog[-_](?:signature|credential)|sharedaccesssignature)/i.test(key));
  } catch { return false; }
}

function evidenceTimeIssue(value) {
  if (typeof value !== 'string' || !ISO.test(value)) return 'invalid';
  const ms = Date.parse(value);
  if (!Number.isFinite(ms) || new Date(ms).toISOString().slice(0, 19) !== value.slice(0, 19)) return 'invalid';
  if (ms > Date.now() + 300000) return 'future';
  if (ms < Date.now() - MAX_EVIDENCE_AGE_MS) return 'stale';
  return null;
}

export function evaluateCommercialEvidence(manifest) {
  const issues = [];
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    return { readyForHumanReview: false, issues: ['Manifest must be an object'] };
  }
  const serialized = JSON.stringify(manifest);
  if (/sk_(?:live|test)_[A-Za-z0-9]+|whsec_[A-Za-z0-9]+|pmo_session=|Bearer\s+[A-Za-z0-9._-]+/i.test(serialized)) {
    return { readyForHumanReview: false, issues: ['Secret-like content detected; remove credentials from evidence'] };
  }
  if (manifest.schemaVersion !== 1) issues.push('Unsupported evidence schema version');
  if (manifest.decision !== 'NO-GO') issues.push('Manifest cannot self-authorize a release');
  const sha = manifest.candidateSha;
  if (typeof sha !== 'string' || !SHA.test(sha)) issues.push('Missing valid 40-character candidate SHA');
  const gates = manifest.gates;
  if (!gates || typeof gates !== 'object' || Array.isArray(gates)) {
    issues.push('Missing gates object');
    return { readyForHumanReview: false, issues };
  }
  for (const id of REQUIRED_GATES) {
    const g = gates[id];
    if (!g || typeof g !== 'object') { issues.push(id + ': no evidence record'); continue; }
    if (g.status !== 'PASS') { issues.push(id + ': not passed'); continue; }
    if (!SHA.test(g.commitSha || '') || g.commitSha !== sha) issues.push(id + ': not verified on candidate SHA');
    if (!isSafeEvidenceUrl(g.artifactUrl)) issues.push(id + ': missing safe HTTPS evidence artifact URL');
    const gateTimeIssue = evidenceTimeIssue(g.executedAtUtc);
    if (gateTimeIssue === 'invalid') issues.push(id + ': invalid UTC execution timestamp');
    else if (gateTimeIssue === 'future') issues.push(id + ': execution timestamp is in the future');
    else if (gateTimeIssue === 'stale') issues.push(id + ': evidence older than 72 hours');
    if (typeof g.environment !== 'string' || !g.environment.trim()) issues.push(id + ': missing environment');
    if (typeof g.reviewer !== 'string' || !g.reviewer.trim()) issues.push(id + ': missing reviewer');
    if (typeof g.testResult !== 'string' || g.testResult !== 'passed') issues.push(id + ': missing passing test result');
    if (id === 'stripe_test_billing') {
      if (g.mode !== 'test') issues.push(id + ': Stripe TEST mode not evidenced');
      const scenarios = g.scenarios;
      if (!scenarios || typeof scenarios !== 'object' || Array.isArray(scenarios)) {
        issues.push(id + ': missing detailed Stripe lifecycle scenarios');
      } else {
        for (const scenarioId of REQUIRED_STRIPE_SCENARIOS) {
          const evidence = scenarios[scenarioId];
          const prefix = id + '.' + scenarioId;
          if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence) || evidence.status !== 'PASS') {
            issues.push(prefix + ': not passed');
            continue;
          }
          if (!SHA.test(evidence.commitSha || '') || evidence.commitSha !== sha) issues.push(prefix + ': candidate SHA mismatch');
          if (!isSafeEvidenceUrl(evidence.artifactUrl)) issues.push(prefix + ': missing safe HTTPS artifact URL');
          const scenarioTimeIssue = evidenceTimeIssue(evidence.executedAtUtc);
          if (scenarioTimeIssue === 'invalid' || scenarioTimeIssue === 'future') issues.push(prefix + ': invalid execution timestamp');
          else if (scenarioTimeIssue === 'stale') issues.push(prefix + ': evidence older than 72 hours');
          if (evidence.testResult !== 'passed') issues.push(prefix + ': missing passing test result');
        }
      }
    }
  }
  return { readyForHumanReview: issues.length === 0, issues };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const file = process.argv[2] || 'docs/commercial-release-evidence.json';
  try {
    const manifest = JSON.parse(await readFile(file, 'utf8'));
    const result = evaluateCommercialEvidence(manifest);
    console.log(result.readyForHumanReview
      ? 'REVIEW-READY: evidence manifest is complete; independent review and explicit approval still required.'
      : 'NO-GO: commercial release evidence is incomplete or inconsistent.');
    for (const issue of result.issues) console.log('BLOCKED ' + issue);
    process.exitCode = result.readyForHumanReview ? 0 : 1;
  } catch {
    console.error('NO-GO: unable to load or parse release evidence manifest');
    process.exitCode = 1;
  }
}

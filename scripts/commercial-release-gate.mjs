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

const SHA = /^[a-f0-9]{40}$/i;
const HTTPS = /^https:\/\/[^\s/?#]+\/[^\s]+$/i;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;

export function evaluateCommercialEvidence(manifest) {
  const issues = [];
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    return { readyForHumanReview: false, issues: ['Manifest must be an object'] };
  }
  const serialized = JSON.stringify(manifest);
  if (/sk_(?:live|test)_[A-Za-z0-9]+|whsec_[A-Za-z0-9]+|pmo_session=|Bearer\s+[A-Za-z0-9._-]+/i.test(serialized)) {
    return { readyForHumanReview: false, issues: ['Secret-like content detected; remove credentials from evidence'] };
  }
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
    if (!HTTPS.test(g.artifactUrl || '')) issues.push(id + ': missing HTTPS evidence artifact URL');
    if (!ISO.test(g.executedAtUtc || '') || !Number.isFinite(Date.parse(g.executedAtUtc))) issues.push(id + ': invalid UTC execution timestamp');
    if (typeof g.environment !== 'string' || !g.environment.trim()) issues.push(id + ': missing environment');
    if (typeof g.reviewer !== 'string' || !g.reviewer.trim()) issues.push(id + ': missing reviewer');
    if (typeof g.testResult !== 'string' || g.testResult !== 'passed') issues.push(id + ': missing passing test result');
    if (id === 'stripe_test_billing' && g.mode !== 'test') issues.push(id + ': Stripe TEST mode not evidenced');
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

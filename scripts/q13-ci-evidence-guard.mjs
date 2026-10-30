/** Q13 independent, offline GitHub Actions evidence guard.
 * Consumes GitHub REST /actions/runs/:id and /actions/runs/:id/jobs JSON.
 * A green workflow is only CI evidence; never external release acceptance.
 */
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const SHA = /^[a-f0-9]{40}$/i;
export const REQUIRED_JOBS = Object.freeze([
  'Dependency-free source checks',
  'audit',
  'Generate dependency remediation candidate (non-deploying)',
  'verify',
]);
export const REQUIRED_VERIFY_STEPS = Object.freeze([
  'Apply production-equivalent SQL-ledger migrations',
  'Apply RLS policies',
  'Assert financial RLS policies on real PostgreSQL',
  'Restore seeded PostgreSQL into an isolated CI database',
  'Types',
  'Tenant isolation must hold',
  'Live authenticated billing, project and workspace-switch isolation',
  'Live financial PostgreSQL RLS tenant-visibility acceptance',
  'Tests',
  'Production build',
  'Build production API Docker image',
  'Build production web Docker image',
  'Live Next.js bilingual and authentication smoke',
  'Enforce current-run CI acceptance evidence',
]);

export function evaluateCiEvidence(run, jobsPayload, expectedSha) {
  const issues = [];
  if (!SHA.test(expectedSha || '')) issues.push('Invalid expected candidate SHA');
  if (!run || run.head_sha !== expectedSha) issues.push('Workflow head SHA does not match expected candidate');
  if (run?.status !== 'completed' || run?.conclusion !== 'success')
    issues.push('Workflow not completed successfully');
  const runId = run?.id;
  if (!Number.isSafeInteger(runId) || runId <= 0)
    issues.push('Missing valid workflow run ID');
  const jobs = jobsPayload?.jobs;
  if (!Array.isArray(jobs)) return { passed: false, issues: [...issues, 'Missing jobs array'] };
  if (!Number.isSafeInteger(jobsPayload.total_count) || jobsPayload.total_count !== jobs.length)
    issues.push('Jobs response is paginated/incomplete');
  const byName = new Map();
  for (const job of jobs) {
    if (!job || typeof job !== 'object' || typeof job.name !== 'string' || !job.name) {
      issues.push('Invalid job record');
      continue;
    }
    if (byName.has(job.name)) issues.push('Duplicate job name: ' + job.name);
    byName.set(job.name, job);
    // The GitHub jobs API includes run_id. Absence is not evidence of provenance.
    if (!Number.isSafeInteger(job.run_id) || job.run_id !== runId)
      issues.push('Job missing or mismatching workflow run ID: ' + job.name);
  }
  for (const name of REQUIRED_JOBS) {
    const job = byName.get(name);
    if (!job) { issues.push('Missing required job: ' + name); continue; }
    if (job.status !== 'completed' || job.conclusion !== 'success')
      issues.push('Required job not successful: ' + name);
    if (!Array.isArray(job.steps)) { issues.push('Missing steps for job: ' + name); continue; }
    for (const step of job.steps) {
      if (!step || step.conclusion !== 'success') issues.push('Non-success step in ' + name + ': ' + (step?.name || '<unknown>'));
    }
    const requiredSteps = name === 'verify' ? REQUIRED_VERIFY_STEPS
      : name === 'audit' ? ['Run pnpm install --frozen-lockfile', 'Run pnpm audit --audit-level high']
      : name === 'Dependency-free source checks' ? ['Run npm run test:offline']
      : [];
    for (const stepName of requiredSteps) {
      const matches = job.steps.filter(step => step?.name === stepName);
      if (matches.length !== 1 || matches[0].conclusion !== 'success')
        issues.push('Missing or unsuccessful required step in ' + name + ': ' + stepName);
    }
  }
  return { passed: issues.length === 0, issues };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [runFile, jobsFile, sha] = process.argv.slice(2);
  if (!runFile || !jobsFile || !sha) {
    console.error('Usage: node scripts/q13-ci-evidence-guard.mjs RUN.json JOBS.json EXACT_40_CHAR_SHA');
    process.exitCode = 2;
  } else {
    try {
      const result = evaluateCiEvidence(JSON.parse(readFileSync(runFile, 'utf8')),
        JSON.parse(readFileSync(jobsFile, 'utf8')), sha);
      console.log(result.passed ? 'CI EVIDENCE PASS (NOT LAUNCH APPROVAL)' : 'CI EVIDENCE BLOCKED');
      for (const issue of result.issues) console.log('BLOCKED ' + issue);
      process.exitCode = result.passed ? 0 : 1;
    } catch (err) {
      console.error('CI EVIDENCE BLOCKED: cannot read or parse input JSON');
      process.exitCode = 1;
    }
  }
}

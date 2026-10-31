import { readFileSync } from 'node:fs';

export function checkCiSafety(source) {
  const checks = [
    ['read-only token', /^permissions:\s*\n  contents: read/m.test(source) && !/^\s*(?:contents|actions|packages|id-token|pull-requests): write\s*$/m.test(source)],
    ['four exact-head PR/push checkouts', source.split("ref: ${{ github.event.pull_request.head.sha || github.sha }}").length - 1 === 4],
    ['four checkout SHA assertions', source.split("run: node scripts/assert-ci-candidate-sha.mjs").length - 1 === 4],
    ['candidate SHA bound to release evidence', source.includes('EPMO_CANDIDATE_SHA: ${{ github.event.pull_request.head.sha || github.sha }}')],
    ['pinned package manager', /version: 10\.17\.0/.test(source)],
    ['frozen dependency installation', /pnpm install --frozen-lockfile/.test(source)],
    ['disposable PostgreSQL', /image: postgres:16-alpine/.test(source)],
    ['disposable services preflight', /node scripts\/verify-ci-services\.mjs/.test(source)],
    ['journaled SQL migrations', /bash scripts\/apply-sql-migrations\.sh/.test(source)],
    ['database RLS policies', /packages\/db\/sql\/rls\.sql/.test(source)],
    ['effective tenant isolation', /pnpm verify:rls/.test(source) && /phase15c-run-financial-rls\.sh/.test(source)],
    ['typecheck and build', /pnpm typecheck/.test(source) && /@pmo\/web build/.test(source) && /@pmo\/api build/.test(source)],
    ['actual restore rehearsal', /verify-ci-database-restore\.mjs/.test(source)],
    ['live recovery authorization', /P0_RECOVERY_LIVE_ACCEPTANCE: 'true'/.test(source)],
    ['signed-in billing isolation', /phase15-billing-isolation\.test\.ts/.test(source)],
    ['CI receipt verification', /phase15e-release-evidence\.mjs verify ci/.test(source)],
    ['commercial status does not equal green CI', /p0-ci-summary\.mjs/.test(source)],
    ['evidence artifact upload', /actions\/upload-artifact@v4/.test(source)],
    ['bounded job execution', ['source-guards', 'verify', 'audit'].every(job => new RegExp(`^  ${job}:\\n(?:.*\\n){0,4}?    timeout-minutes: [1-9]\\d*`, 'm').test(source))],
  ];
  return { passed: checks.every(([, ok]) => ok), checks: checks.map(([name, passed]) => ({ name, passed })) };
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const file = new URL('../.github/workflows/ci.yml', import.meta.url);
  const result = checkCiSafety(readFileSync(file, 'utf8'));
  for (const { name, passed } of result.checks) console.log(`${passed ? 'PASS' : 'FAIL'} ${name}`);
  if (!result.passed) process.exitCode = 1;
}

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ci = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');
const launch = readFileSync(new URL('./phase15e-release-evidence.mjs', import.meta.url), 'utf8');
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

test('CI accepts a deliberate manual run without removing push/PR triggers', () => {
  assert.match(ci, /^on:\s*\n  push:.*\n  pull_request:\s*\n(?:  #[^\n]*\n)*  workflow_dispatch:/m);
});
test('CI uses read-only GitHub token for every job by default', () => {
  assert.match(ci, /^permissions:\s*\n  contents: read/m);
  assert.doesNotMatch(ci, /^\s*(?:actions|contents|packages|id-token|pull-requests):\s*write/m);
});
test('CI has dependency-free checks, a full integration job, and vulnerability audit', () => {
  assert.match(ci, /^  source-guards:/m);
  assert.match(ci, /^  verify:/m);
  assert.match(ci, /^  audit:/m);
  assert.match(ci, /pnpm install --frozen-lockfile/);
  assert.equal(pkg.packageManager, 'pnpm@10.17.0');
});
test('a manual run cannot mark CI accepted without compiled web and recovery evidence', () => {
  assert.match(ci, /pnpm --filter @pmo\/web build/);
  assert.match(ci, /pnpm exec vitest run tests\/password-recovery\.test\.ts/);
  assert.match(ci, /node scripts\/phase15e-release-evidence\.mjs verify ci/);
  assert.match(launch, /'recovery_api', 'production_build', 'web_runtime'/);
});
test('CI includes actual Postgres migrations, RLS checks and API smoke', () => {
  assert.match(ci, /image: postgres:16-alpine/);
  assert.match(ci, /bash scripts\/apply-sql-migrations\.sh/);
  assert.match(ci, /assert-global-role-privileges\.sql/);
  assert.match(ci, /pnpm --filter @pmo\/api build/);
  assert.match(ci, /pnpm exec vitest run tests\/phase15-billing-isolation\.test\.ts/);
});
test('CI evidence is tied to current GitHub run and cannot be overwritten', () => {
  assert.match(launch, /receipt\.sha === sha && receipt\.runId === runId/);
  assert.match(launch, /flag: 'wx'/);
});

test('every CI job is time-bounded to prevent stalled release verification', () => {
  assert.match(ci, /  source-guards:\n    name: Dependency-free source checks\n    runs-on: ubuntu-latest\n    timeout-minutes: 15/);
  assert.match(ci, /  verify:\n    runs-on: ubuntu-latest\n    timeout-minutes: 90/);
  assert.match(ci, /  audit:\n    runs-on: ubuntu-latest\n    timeout-minutes: 20/);
});

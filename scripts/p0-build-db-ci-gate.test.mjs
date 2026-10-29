import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CI_GATES, LAUNCH_GATES, verifyReceipts, recordGate } from './phase15e-release-evidence.mjs';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ci = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');
const liveTest = readFileSync(new URL('../tests/password-recovery.test.ts', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../packages/db/migrations/0019_password_recovery.sql', import.meta.url), 'utf8');

test('CI runs actual dependency-backed workspace builds and typechecks', () => {
  assert.match(ci, /pnpm install --frozen-lockfile/);
  assert.match(ci, /pnpm build:packages/);
  assert.match(ci, /pnpm typecheck/);
  assert.match(ci, /pnpm --filter @pmo\/api build/);
  assert.match(ci, /pnpm --filter @pmo\/web build/);
  assert.match(ci, /verify-build-artifacts\.mjs --scope all/);
});
test('CI migrates a real database, applies RLS, and checks effective privileges', () => {
  const migrate = ci.indexOf('bash scripts/apply-sql-migrations.sh');
  const rls = ci.indexOf('-f packages/db/sql/rls.sql');
  const privilege = ci.indexOf('-f packages/db/sql/assert-global-role-privileges.sql');
  assert.ok(migrate > 0 && rls > migrate && privilege > rls);
});
test('CI explicitly runs opt-in live recovery on a disposable loopback database', () => {
  assert.match(ci, /pnpm exec vitest run tests\/password-recovery\.test\.ts/);
  assert.match(ci, /P0_RECOVERY_LIVE_ACCEPTANCE: 'true'/);
  assert.match(ci, /PHASE15_ACCEPT_DISPOSABLE_DB: 'YES_RESEED_DISPOSABLE_TEST_DATABASE'/);
  assert.match(ci, /TEST_API: http:\/\/localhost:4000/);
  assert.ok(ci.indexOf('name: Start API') < ci.indexOf('Live password recovery, token replay and session revocation'));
});
test('recovery CI receipt is recorded only after live test exits successfully', () => {
  const testAt = ci.indexOf('pnpm exec vitest run tests/password-recovery.test.ts');
  const evidenceAt = ci.indexOf('record recovery_api');
  const finalAt = ci.indexOf('verify ci');
  assert.ok(testAt >= 0 && evidenceAt > testAt && finalAt > evidenceAt);
  assert.ok(CI_GATES.includes('recovery_api'));
  assert.ok(LAUNCH_GATES.includes('recovery_api'));
});
test('missing recovery API evidence blocks CI even when previous gates succeeded', () => {
  const dir = mkdtempSync(join(tmpdir(), 'epmo-recovery-gates-'));
  const ctx = { sha: 'b'.repeat(40), runId: '2301' };
  try {
    for (const gate of CI_GATES) if (gate !== 'recovery_api') recordGate(dir, gate, ctx);
    const result = verifyReceipts(dir, 'ci', ctx);
    assert.equal(result.passed, false);
    assert.ok(result.checks.some(c => c.gate === 'recovery_api' && !c.passed));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
test('live test covers simultaneous redemption and checks exactly one new audit event', () => {
  assert.match(liveTest, /Promise\.all\(\[/);
  assert.match(liveTest, /\[200,400\]/);
  assert.match(liveTest, /toBe\(before \+ 1\)/);
});
test('security definer function revokes all user sessions before reporting reset success', () => {
  assert.match(migration, /SECURITY DEFINER/);
  assert.match(migration, /FOR UPDATE/);
  assert.match(migration, /DELETE FROM public\.sessions WHERE user_id = target_user/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.pmo_redeem_password_reset\(text, text\) FROM PUBLIC/);
});

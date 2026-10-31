import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { CI_GATES, LAUNCH_GATES, makeReceipt, recordGate, verifyReceipts, assertContext } from './phase15e-release-evidence.mjs';
const context = { sha: 'a'.repeat(40), runId: '123456' };
const other = { sha: 'b'.repeat(40), runId: '999' };
const withDir = fn => { const dir = mkdtempSync(join(tmpdir(), 'epmo-evidence-')); try { return fn(dir); } finally { rmSync(dir, { recursive: true, force: true }); } };
test('all CI release gates are unique and launch requires extra live evidence', () => {
  assert.equal(new Set(CI_GATES).size, CI_GATES.length);
  assert.equal(new Set(LAUNCH_GATES).size, LAUNCH_GATES.length);
  assert.equal(LAUNCH_GATES.length - CI_GATES.length, 6);
});
test('missing receipts block both CI and launch', () => withDir(dir => {
  assert.equal(verifyReceipts(dir, 'ci', context).passed, false);
  assert.equal(verifyReceipts(dir, 'launch', context).passed, false);
}));
test('all CI receipts allow CI profile but not launch profile', () => withDir(dir => {
  for (const gate of CI_GATES) recordGate(dir, gate, context);
  assert.equal(verifyReceipts(dir, 'ci', context).passed, true);
  assert.equal(verifyReceipts(dir, 'launch', context).passed, false);
}));
test('CI cannot mint live provider, browser or recovery acceptance receipts', () => withDir(dir => {
  for (const gate of CI_GATES) recordGate(dir, gate, context);
  for (const gate of LAUNCH_GATES.filter(gate => !CI_GATES.includes(gate))) {
    assert.throws(() => makeReceipt(gate, context), /Independent external acceptance/);
    assert.throws(() => recordGate(dir, gate, context), /Independent external acceptance/);
    // Even manually fabricated same-SHA, same-run, fresh JSON is NOT proof.
    writeFileSync(join(dir, gate + '.json'), JSON.stringify({
      schemaVersion: 1, gate, status: 'passed', sha: context.sha,
      runId: context.runId, timestamp: new Date().toISOString(),
    }));
  }
  const ci = verifyReceipts(dir, 'ci', context);
  const launch = verifyReceipts(dir, 'launch', context);
  assert.equal(ci.passed, true);
  assert.equal(launch.passed, false);
  assert.equal(launch.checks.filter(item => item.passed).length, CI_GATES.length);
  for (const item of launch.checks.filter(item => !CI_GATES.includes(item.gate))) {
    assert.equal(item.passed, false);
    assert.match(item.reason, /independent external acceptance/);
  }
}));
test('different CI commit is rejected', () => withDir(dir => {
  for (const gate of CI_GATES) recordGate(dir, gate, context);
  assert.equal(verifyReceipts(dir, 'ci', { ...context, sha: other.sha }).passed, false);
}));
test('different CI run ID is rejected', () => withDir(dir => {
  for (const gate of CI_GATES) recordGate(dir, gate, context);
  assert.equal(verifyReceipts(dir, 'ci', { ...context, runId: other.runId }).passed, false);
}));
test('invalid and future timestamps are rejected', () => withDir(dir => {
  for (const gate of CI_GATES) recordGate(dir, gate, context);
  const path = join(dir, 'billing_api.json');
  const record = JSON.parse(readFileSync(path, 'utf8'));
  record.timestamp = '2200-01-01T00:00:00Z';
  writeFileSync(path, JSON.stringify(record));
  assert.equal(verifyReceipts(dir, 'ci', context).passed, false);
}));
test('malformed receipts fail closed', () => withDir(dir => {
  for (const gate of CI_GATES) recordGate(dir, gate, context);
  writeFileSync(join(dir,'billing_api.json'), '{notjson');
  assert.equal(verifyReceipts(dir, 'ci', context).passed, false);
}));
test('an old successful receipt is not current release evidence', () => withDir(dir => {
  for (const gate of CI_GATES) recordGate(dir, gate, context);
  const time = new Date(Date.now() + 48 * 60 * 60 * 1000);
  assert.equal(verifyReceipts(dir, 'ci', context, time).passed, false);
}));
test('duplicate receipts are rejected rather than overwritten', () => withDir(dir => {
  recordGate(dir,'packages_build',context);
  assert.throws(()=>recordGate(dir,'packages_build',context), { code: 'EEXIST' });
}));
test('unknown gate and malformed context are rejected', () => {
  assert.throws(()=>makeReceipt('false_positive',context), /Unknown release gate/);
  assert.throws(()=>assertContext({sha:'abc',runId:'1'}), /Missing\/invalid/);
  assert.throws(()=>assertContext({sha:'a'.repeat(40),runId:'0'}), /Missing\/invalid/);
});
test('a receipt whose gate or status was edited is rejected', () => withDir(dir => {
  for (const gate of CI_GATES) recordGate(dir,gate,context);
  const path=join(dir,'types.json'); const data=JSON.parse(readFileSync(path,'utf8'));
  data.gate='web_runtime'; data.status='skipped'; writeFileSync(path,JSON.stringify(data));
  assert.equal(verifyReceipts(dir,'ci',context).passed,false);
}));

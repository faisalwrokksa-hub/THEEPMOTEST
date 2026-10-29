import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const gates = readFileSync(new URL('../apps/api/src/governance/gate-writes.service.ts', import.meta.url), 'utf8');
const excel = readFileSync(new URL('../apps/api/src/excel/excel.service.ts', import.meta.url), 'utf8');
const creates = readFileSync(new URL('../apps/api/src/creates/creates.service.ts', import.meta.url), 'utf8');
function section(text, start, end) {
  const begin = text.indexOf(start);
  const finish = text.indexOf(end, begin + start.length);
  assert.ok(begin >= 0 && finish > begin, `section ${start} ... ${end} exists`);
  return text.slice(begin, finish);
}

// Source-contract checks only. Live concurrent API tests reside in gate-writes.test.ts.
test('gate lock is transaction-held PostgreSQL row lock', () => {
  assert.match(gates, /private async lockGate\(/);
  assert.match(gates, /SELECT id, status FROM gates WHERE id = \$\{gateId\} FOR UPDATE/);
});
test('criterion updates lock gate and reread row before changing it', () => {
  const method = section(gates, 'async setCriterion(', 'async decide(');
  assert.match(method, /await this\.lockGate\(tx, link\.gateId\)/);
  assert.ok(method.indexOf('await this.lockGate') < method.indexOf('SELECT c.id, c.label'));
});
test('approval decisions lock gate before rechecking pending status and signer', () => {
  const method = section(gates, 'async decide(', 'async readiness(');
  assert.match(method, /await this\.lockGate\(tx, link\.gateId\)/);
  assert.ok(method.indexOf('await this.lockGate') < method.indexOf('SELECT a.id, a.gate_id'));
  assert.match(method, /a\.decision !== 'pending'/);
  assert.match(method, /a\.approverId !== userId/);
});
test('advance locks project then gate before recalculating readiness and auditing', () => {
  const method = section(gates, 'async advance(', 'async updateRaid(');
  assert.match(method, /SELECT id FROM projects WHERE id = \$\{linked\.projectId\} FOR UPDATE/);
  assert.ok(method.indexOf('FOR UPDATE') < method.indexOf('await this.lockGate'));
  assert.ok(method.indexOf('await this.lockGate') < method.indexOf('await gateBlockers'));
  assert.match(method, /await this\.audit\(tx, 'gate', gateId, 'gate\.approved'/);
});
test('updates to RAID blockers serialize with an advancing gate', () => {
  const method = section(gates, 'async updateRaid(', 'async updateTask(');
  assert.match(method, /if \(link\.blocksGateId\) await this\.lockGate\(tx, link\.blocksGateId\)/);
});
test('gate approver reassignment and criteria additions serialize with advance', () => {
  assert.match(section(gates, 'async assignApprover(', 'async addCriterion('), /await this\.lockGate\(tx, gateId\)/);
  assert.match(section(gates, 'async addCriterion(', '\n}\n'), /await this\.lockGate\(tx, gateId\)/);
});
test('unchanged task state skips another update and audit', () => {
  const method = section(gates, 'async updateTask(', 'async assignApprover(');
  assert.ok(method.indexOf('before.state === state') < method.indexOf('UPDATE tasks SET state'));
});
test('unchanged criterion and evidence skip another update and audit', () => {
  const method = section(gates, 'async setCriterion(', 'async decide(');
  assert.match(method, /before\.isMet === body\.isMet/);
  assert.ok(method.indexOf('before.isMet === body.isMet') < method.indexOf('UPDATE gate_criteria SET'));
});
test('Excel update locks all gates in order after project update', () => {
  const method = section(excel, 'const gateId = new Map<number, string>()', 'const seenCriteria =');
  assert.match(method, /ORDER BY seq FOR UPDATE/);
  assert.match(method, /gateStatus\.set/);
});
test('Excel reimport cannot add criteria to an approved gate', () => {
  assert.match(excel, /updating && gateStatus\.get\(seq\) === 'approved'/);
  assert.match(excel, /was not added to a signed-off gate/);
});
test('RAID creation locks project and active gate before inserting a blocker', () => {
  const method = section(creates, 'async raid(', 'async task(');
  assert.match(method, /SELECT id FROM projects WHERE id = \$\{b\.projectId\} FOR UPDATE/);
  assert.match(method, /AND status = 'active' FOR UPDATE/);
  assert.match(method, /throw new ConflictException\('No active stage gate/);
});
test('audit writes run in the same database transaction', () => {
  assert.match(gates, /private async audit\(tx: any,/);
  assert.match(gates, /await tx\.insert\(auditEvents\)/);
});

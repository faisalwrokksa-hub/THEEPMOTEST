import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../apps/api/src/creates/creates.service.ts', import.meta.url), 'utf8');
const controller = readFileSync(new URL('../apps/api/src/creates/creates.controller.ts', import.meta.url), 'utf8');

function method(name) {
  const start = source.indexOf(`  async ${name}(`);
  assert.notEqual(start, -1, `missing ${name} method`);
  const next = source.slice(start + 1).search(/\n  (?:async |private async )\w+\(/);
  return next < 0 ? source.slice(start) : source.slice(start, start + 1 + next);
}

for (const [name, insert, memberReference] of [
  ['raid', 'raid_items', 'ownerId'],
  ['task', 'tasks', 'assigneeId'],
  ['benefit', 'benefits', 'ownerId'],
  ['document', 'documents', 'ownerId'],
]) {
  test(`${name}: project is verified before insert`, () => {
    const body = method(name);
    const projectCheck = body.indexOf('await this.mustOwnProject(tx, b.projectId)');
    const insertAt = body.indexOf(`INSERT INTO ${insert}`);
    assert.ok(projectCheck >= 0 && insertAt > projectCheck);
    assert.ok(body.indexOf('withTenant(tenantId, async (tx) =>') < projectCheck);
  });
  test(`${name}: assigned person is a tenant member before insert`, () => {
    const body = method(name);
    const memberCheck = body.indexOf(`await this.mustOwnMember(tx, b.${memberReference})`);
    const insertAt = body.indexOf(`INSERT INTO ${insert}`);
    assert.ok(memberCheck >= 0 && insertAt > memberCheck);
    assert.ok(body.indexOf('withTenant(tenantId, async (tx) =>') < memberCheck);
  });
}

test('updates: optional project is verified before insert', () => {
  const body = method('update');
  assert.ok(body.indexOf('await this.mustOwnProject(tx, b.projectId)') < body.indexOf('INSERT INTO updates'));
  assert.match(body, /withTenant\(tenantId, async \(tx\) =>/);
});

test('task and RAID writes retain required module guards and capabilities', () => {
  assert.match(controller, /@RequiresModule\('risk360'\) @Post\('raid'\)/);
  assert.match(controller, /@RequiresModule\('pmo360'\) @Post\('task'\)/);
  assert.match(method('raid'), /requireCapability\('pmoa_manage_raid'\)/);
  assert.match(method('task'), /requireCapability\('pmoa_manage_work'\)/);
});

test('project lookup does not accept IDs without a tenant-filtered transaction', () => {
  assert.match(source, /private async mustOwnProject\(tx: any, projectId\?: string\)/);
  assert.match(source, /SELECT id FROM projects WHERE id = \$\{projectId\}/);
  assert.match(source, /if \(!p\) throw new NotFoundException/);
});

test('member lookup is against tenant-isolated memberships, not global users', () => {
  assert.match(source, /private async mustOwnMember\(tx: any, memberId\?: string\)/);
  assert.match(source, /SELECT user_id FROM memberships WHERE user_id = \$\{memberId\}/);
  assert.match(source, /if \(!member\) throw new NotFoundException/);
});

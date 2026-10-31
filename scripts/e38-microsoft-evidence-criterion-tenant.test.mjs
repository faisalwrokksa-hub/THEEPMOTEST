import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const service = readFileSync(new URL('../apps/api/src/microsoft/microsoft.service.ts', import.meta.url), 'utf8');
const upload = service.slice(service.indexOf('async upload('), service.indexOf('private async uploadLarge('));

test('cross-tenant and wrong-project evidence criteria are rejected before Graph upload', () => {
  const firstCheck = upload.indexOf('SELECT gc.id FROM gate_criteria AS gc');
  const token = upload.indexOf("const token = await this.accessToken('graph')");
  const graph = upload.indexOf('const item = file.buffer.length');
  assert.ok(firstCheck >= 0 && firstCheck < token && token < graph);
  const preflight = upload.slice(firstCheck, token);
  assert.ok(preflight.includes('JOIN gates AS g ON g.id = gc.gate_id'));
  assert.ok(preflight.includes('gc.tenant_id = ${tenantId}'));
  assert.ok(preflight.includes('g.tenant_id = ${tenantId}'));
  assert.ok(preflight.includes('g.project_id = ${b.projectId ?? null}::uuid'));
  assert.ok(preflight.includes('if (!validCriterion)'));
  assert.ok(preflight.includes('throw new NotFoundException'));
});

test('evidence association is locked and revalidated before document INSERT', () => {
  const final = upload.indexOf('const doc = await withTenant(tenantId');
  const guard = upload.indexOf('FOR SHARE OF gc, g', final);
  const insert = upload.indexOf('INSERT INTO documents', final);
  assert.ok(final >= 0 && guard > final && insert > guard);
  const finalization = upload.slice(final, insert);
  assert.ok(finalization.includes('gc.tenant_id = ${tenantId}'));
  assert.ok(finalization.includes('g.tenant_id = ${tenantId}'));
  assert.ok(finalization.includes('g.project_id = ${b.projectId ?? null}::uuid'));
  assert.ok(finalization.includes('throw new ConflictException'));
  assert.equal(finalization.split('await withTenant(').length, 2);
});

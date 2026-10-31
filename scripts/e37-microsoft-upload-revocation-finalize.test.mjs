import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const service = readFileSync(new URL('../apps/api/src/microsoft/microsoft.service.ts', import.meta.url), 'utf8');
const upload = service.slice(service.indexOf('async upload('), service.indexOf('private async uploadLarge('));

test('document upload rechecks the active consenting identity after Graph completes', () => {
  const graphUpload = upload.indexOf('const item = file.buffer.length');
  const finalization = upload.indexOf('const doc = await withTenant(tenantId');
  const activeCheck = upload.indexOf('SELECT id FROM integration_connections', finalization);
  const insert = upload.indexOf('INSERT INTO documents', finalization);
  assert.ok(graphUpload >= 0 && finalization > graphUpload && activeCheck > finalization && insert > activeCheck);
  const guard = upload.slice(activeCheck, insert);
  assert.match(guard, /connected_by = \\$\\{userId\\}/);
  assert.match(guard, /status = 'connected'/);
  assert.match(guard, /drive_id = \\$\\{c\\.drive_id\\}/);
  assert.match(guard, /root_item_id = \\$\\{c\\.root_item_id\\}/);
  assert.match(guard, /FOR SHARE/);
  assert.match(guard, /if \\(!active\\)\\s*\\{\\s*throw new ConflictException/);
});

test('the connection check and document write share one tenant transaction', () => {
  const start = upload.indexOf('const doc = await withTenant(tenantId');
  const insert = upload.indexOf('INSERT INTO documents', start);
  const audit = upload.indexOf("await this.audit(tx, d.id, 'document.uploaded'", insert);
  const close = upload.indexOf('return d;', audit);
  assert.ok(start >= 0 && insert > start && audit > insert && close > audit);
  assert.doesNotMatch(upload.slice(start, insert), /await withTenant\\(/);
});

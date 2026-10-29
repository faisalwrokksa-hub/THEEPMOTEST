import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertTenantPage, assertProjectDetail, assertDeniedForeignRecord,
  assertActiveTenant, assertTenantInvoiceList,
} from './phase16e-tenant-assertions.mjs';
const A = 'tenant-a', B = 'tenant-b';
const page = { items: [{ id: 'project-a', tenantId: A }], nextCursor: null };
test('accepts populated tenant-scoped project list with expected seed', () =>
  assert.equal(assertTenantPage(page, A, B, 'project-a'), true));
test('rejects empty list as non-evidence', () =>
  assert.throws(() => assertTenantPage({ items: [] }, A, B, 'project-a')));
test('rejects duplicate tenant IDs', () =>
  assert.throws(() => assertTenantPage(page, A, A, 'project-a')));
test('rejects missing project fixture', () =>
  assert.throws(() => assertTenantPage(page, A, B, 'project-missing')));
test('rejects foreign project in list', () =>
  assert.throws(() => assertTenantPage({ items: [...page.items, { id: 'b', tenantId: B }] }, A, B, 'project-a')));
test('rejects malformed project row', () =>
  assert.throws(() => assertTenantPage({ items: [{ id: null, tenantId: A }] }, A, B, 'project-a')));
test('accepts correct project detail', () =>
  assert.equal(assertProjectDetail(page.items[0], A, 'project-a'), true));
test('rejects foreign project detail', () =>
  assert.throws(() => assertProjectDetail({ id: 'project-a', tenantId: B }, A, 'project-a')));
test('requires 404 for foreign project details', () => {
  assert.equal(assertDeniedForeignRecord({ status: 404 }, 'project'), true);
  assert.throws(() => assertDeniedForeignRecord({ status: 200 }, 'project'));
  assert.throws(() => assertDeniedForeignRecord({ status: 403 }, 'project'));
});
test('checks active workspace in authenticated session', () => {
  assert.equal(assertActiveTenant({ authenticated: true, tenantId: A }, A), true);
  assert.throws(() => assertActiveTenant({ authenticated: true, tenantId: B }, A));
  assert.throws(() => assertActiveTenant({ authenticated: false, tenantId: A }, A));
});
test('checks invoicing after workspace switch', () =>
  assert.equal(assertTenantInvoiceList([{ id: 'inv-a', tenantId: A }], A, B, 'inv-a'), true));
test('rejects empty invoice response and foreign invoice', () => {
  assert.throws(() => assertTenantInvoiceList([], A, B, 'inv-a'));
  assert.throws(() => assertTenantInvoiceList([{ id: 'inv-b', tenantId: B }], A, B, 'inv-a'));
});

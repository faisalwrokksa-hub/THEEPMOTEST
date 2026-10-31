import test from 'node:test';
import assert from 'node:assert/strict';
import { assertRestrictedVerifierRole, tenantRowsVisibleAndIsolated } from './rls-verification-policy.ts';

test('RLS verification rejects privileged, bypass and unexpected database principals', () => {
  assert.doesNotThrow(() => assertRestrictedVerifierRole({ name: 'pmo_app', superuser: false, bypassrls: false }));
  for (const role of [undefined,
    { name: 'postgres', superuser: true, bypassrls: true },
    { name: 'pmo_app', superuser: true, bypassrls: false },
    { name: 'pmo_app', superuser: false, bypassrls: true },
    { name: 'other', superuser: false, bypassrls: false },
  ]) assert.throws(() => assertRestrictedVerifierRole(role));
});

test('tenant isolation verifier rejects deny-all, cross-tenant and mixed result sets', () => {
  assert.equal(tenantRowsVisibleAndIsolated([], 'a'), false);
  assert.equal(tenantRowsVisibleAndIsolated([{ tenant_id: 'b' }], 'a'), false);
  assert.equal(tenantRowsVisibleAndIsolated([{ tenant_id: 'a' }, { tenant_id: 'b' }], 'a'), false);
  assert.equal(tenantRowsVisibleAndIsolated([{ tenant_id: 'a' }, { tenant_id: 'a' }], 'a'), true);
});

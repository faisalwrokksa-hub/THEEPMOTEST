import test from 'node:test';
import assert from 'node:assert/strict';
import { assertTenantRlsCatalog } from './tenant-rls-catalog-policy.ts';

const good = (table_name = 'projects') => ({
  table_name, enabled: true, forced: true,
  policy_name: 'tenant_isolation', permissive: 'PERMISSIVE', command: 'ALL',
  using_expression: '(tenant_id = app_current_tenant())',
  check_expression: '(tenant_id = app_current_tenant())',
});

test('requires a complete catalog and enforced RLS for every tenant table', () => {
  assert.throws(() => assertTenantRlsCatalog([]), /No tenant-scoped/);
  assert.equal(assertTenantRlsCatalog([good(), good('documents')]), 2);
  assert.throws(() => assertTenantRlsCatalog([good(), { ...good('documents'), forced: false }]), /documents/);
  assert.throws(() => assertTenantRlsCatalog([{ ...good(), enabled: false }]), /ENABLE and FORCE/);
});

test('rejects absent, incomplete or additional permissive policies', () => {
  assert.throws(() => assertTenantRlsCatalog([{ ...good(), policy_name: null, permissive: null }]), /missing or additional/);
  assert.throws(() => assertTenantRlsCatalog([{ ...good(), command: 'SELECT' }]), /incomplete/);
  assert.throws(() => assertTenantRlsCatalog([{ ...good(), check_expression: null }]), /incomplete/);
  assert.throws(() => assertTenantRlsCatalog([{ ...good(), using_expression: 'true' }]), /incomplete/);
  assert.throws(() => assertTenantRlsCatalog([good(), { ...good(), policy_name: 'bypass_all', using_expression: 'true' }]), /additional permissive/);
});

test('allows additional restrictive policies without treating them as an OR bypass', () => {
  assert.equal(assertTenantRlsCatalog([good(), {
    ...good(), policy_name: 'restrict_status', permissive: 'RESTRICTIVE',
    using_expression: 'is_active', check_expression: 'is_active',
  }]), 1);
});

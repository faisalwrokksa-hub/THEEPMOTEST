/** Security regression: pg_policies predicate must be checked as a whole expression. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { assertTenantRlsCatalog } from './tenant-rls-catalog-policy.ts';

const base = {
  table_name: 'projects', enabled: true, forced: true,
  policy_name: 'tenant_isolation', permissive: 'PERMISSIVE', command: 'ALL',
  using_expression: '(tenant_id = app_current_tenant())',
  check_expression: '(tenant_id = app_current_tenant())',
};
const check = expression => assertTenantRlsCatalog([
  { ...base, using_expression: expression, check_expression: expression },
]);

test('canonical tenant predicate allows only the complete reviewed expression', () => {
  assert.equal(check('((tenant_id = public.app_current_tenant()))'), 1);
  for (const expression of [
    'COALESCE(tenant_id = app_current_tenant(), true)',
    'tenant_id = app_current_tenant() IS NOT FALSE',
    '(tenant_id = app_current_tenant()) OR true',
    '(tenant_id = app_current_tenant()) AND true',
    'CASE WHEN tenant_id = app_current_tenant() THEN true ELSE true END',
  ]) {
    assert.throws(() => check(expression), /unsafe or incomplete/, expression);
  }
});

test('legacy tenant predicate rejects COALESCE and other wrapper bypasses', () => {
  const expression = "tenant_id = NULLIF(current_setting('app.tenant_id'::text, true), ''::text)::uuid";
  const legacy = { ...base, table_name: 'subscription_events',
    policy_name: 'subscription_events_isolation',
    using_expression: expression, check_expression: expression };
  assert.equal(assertTenantRlsCatalog([{ ...base, table_name: 'subscription_events' }, legacy]), 1);
  for (const unsafe of [
    `COALESCE((${expression}), true)`,
    `(${expression}) IS NOT FALSE`,
    `CASE WHEN ${expression} THEN true ELSE true END`,
  ]) {
    assert.throws(() => assertTenantRlsCatalog([
      { ...base, table_name: 'subscription_events' },
      { ...legacy, using_expression: unsafe },
    ]), /unsafe or incomplete/, unsafe);
  }
});

test('legacy and canonical policies reject unsafe WITH CHECK independently', () => {
  assert.throws(() => assertTenantRlsCatalog([{
    ...base, check_expression: 'COALESCE(tenant_id = app_current_tenant(), true)',
  }]), /unsafe or incomplete/);
  const legacy = { ...base, table_name: 'tenant_profiles', policy_name: 'tenant_profiles_isolation',
    using_expression: "tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid",
    check_expression: "COALESCE(tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid, true)" };
  assert.throws(() => assertTenantRlsCatalog([
    { ...base, table_name: 'tenant_profiles' }, legacy,
  ]), /unsafe or incomplete/);
});

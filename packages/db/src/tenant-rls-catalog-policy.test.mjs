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
  assert.throws(() => assertTenantRlsCatalog([{ ...good(), policy_name: null, permissive: null }]), /missing or duplicate/);
  assert.throws(() => assertTenantRlsCatalog([{ ...good(), command: 'SELECT' }]), /incomplete/);
  assert.throws(() => assertTenantRlsCatalog([{ ...good(), check_expression: null }]), /incomplete/);
  assert.throws(() => assertTenantRlsCatalog([{ ...good(), using_expression: 'true' }]), /incomplete/);
  assert.throws(() => assertTenantRlsCatalog([good(), { ...good(), policy_name: 'bypass_all', using_expression: 'true' }]), /unsafe or incomplete/);
});

test('allows additional restrictive policies without treating them as an OR bypass', () => {
  assert.equal(assertTenantRlsCatalog([good(), {
    ...good(), policy_name: 'restrict_status', permissive: 'RESTRICTIVE',
    using_expression: 'is_active', check_expression: 'is_active',
  }]), 1);
});

test('accepts only tenant-bound legacy billing policies alongside the canonical policy', () => {
  const legacy = {
    ...good('billing_invoices'), policy_name: 'billing_tenant_isolation',
    using_expression: "(tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid)",
    check_expression: "(tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid)",
  };
  assert.equal(assertTenantRlsCatalog([good('billing_invoices'), legacy]), 1);
  assert.throws(() => assertTenantRlsCatalog([good('billing_invoices'), {
    ...legacy, using_expression: "tenant_id = app_current_tenant() OR true",
  }]), /unsafe or incomplete/);
  assert.throws(() => assertTenantRlsCatalog([good('billing_invoices'), {
    ...legacy, policy_name: 'unknown_bypass',
  }]), /unsafe or incomplete/);
  assert.throws(() => assertTenantRlsCatalog([{
    ...good(), using_expression: 'tenant_id = app_current_tenant() OR true',
  }]), /unsafe or incomplete/);
});

test('recognizes only tenant-bound legacy subscription policies from migration 0011', () => {
  const subscriptionLegacy = {
    ...good('subscription_events'), policy_name: 'subscription_events_isolation',
    using_expression: "tenant_id = NULLIF(current_setting('app.tenant_id'::text, true), ''::text)::uuid",
    check_expression: "tenant_id = NULLIF(current_setting('app.tenant_id'::text, true), ''::text)::uuid",
  };
  const tenantSubscriptionLegacy = {
    ...subscriptionLegacy, table_name: 'tenant_subscriptions',
    policy_name: 'tenant_subscriptions_isolation',
  };
  assert.equal(assertTenantRlsCatalog([
    good('subscription_events'), subscriptionLegacy,
    good('tenant_subscriptions'), tenantSubscriptionLegacy,
  ]), 2);
  assert.throws(() => assertTenantRlsCatalog([
    good('subscription_events'), { ...subscriptionLegacy, check_expression: 'true' },
  ]), /unsafe or incomplete/);
  assert.throws(() => assertTenantRlsCatalog([
    good('subscription_events'), { ...subscriptionLegacy, using_expression: 'tenant_id = app_current_tenant() OR true' },
  ]), /unsafe or incomplete/);
});

test('migration 0016 workspace profile and invitation policies are tenant-bound', () => {
  const legacyExpression = "tenant_id = NULLIF(current_setting('app.tenant_id'::text, true), ''::text)::uuid";
  const profile = {
    ...good('tenant_profiles'), policy_name: 'tenant_profiles_isolation',
    using_expression: legacyExpression, check_expression: legacyExpression,
  };
  const invitation = {
    ...good('tenant_invitations'), policy_name: 'tenant_invitations_isolation',
    using_expression: legacyExpression, check_expression: legacyExpression,
  };
  assert.equal(assertTenantRlsCatalog([
    good('tenant_profiles'), profile, good('tenant_invitations'), invitation,
  ]), 2);
  assert.throws(() => assertTenantRlsCatalog([
    good('tenant_invitations'), { ...invitation, using_expression: 'true' },
  ]), /unsafe or incomplete/);
});

/**
 * P0 acceptance: inspecting only projects misses a newly introduced tenant_id
 * table with RLS disabled or a permissive bypass policy. This is a catalog
 * assertion, not a substitute for real cross-tenant row-visibility tests.
 */
export type TenantPolicyRow = {
  table_name: string;
  enabled: boolean;
  forced: boolean;
  policy_name: string | null;
  permissive: string | null;
  command: string | null;
  using_expression: string | null;
  check_expression: string | null;
};

const tenantPredicate = /\btenant_id\s*=\s*(?:public\.)?app_current_tenant\(\)/i;
// These named policies are created by reviewed additive SQL migrations. They
// use the same tenant setting as app_current_tenant(), and remain permissive
// only when BOTH USING and WITH CHECK are tenant-bound.
const legacyBillingNames = new Set([
  'tenant_subscriptions_isolation', 'subscription_events_isolation',
  'billing_tenant_isolation', 'billing_stripe_tenant_isolation',
  'billing_payment_exception_tenant_isolation',
]);
const legacyBillingPredicate = (expression: string | null) => {
  const text = expression ?? '';
  // PostgreSQL normalizes current_setting casts and parentheses in pg_policies.
  return /\btenant_id\s*=/.test(text) && /\bNULLIF\s*\(/i.test(text) &&
    /\bcurrent_setting\s*\(/i.test(text) && /'app\.tenant_id'/i.test(text) &&
    !/\bOR\b/i.test(text);
};

export function assertTenantRlsCatalog(rows: ReadonlyArray<TenantPolicyRow>): number {
  if (!rows.length) throw new Error('No tenant-scoped PostgreSQL tables found; RLS verification cannot pass');
  const tables = new Map<string, TenantPolicyRow[]>();
  for (const row of rows) {
    const list = tables.get(row.table_name) ?? [];
    list.push(row);
    tables.set(row.table_name, list);
  }
  for (const [table, policies] of tables) {
    if (policies.some(row => !row.enabled || !row.forced))
      throw new Error(`Tenant table ${table} must ENABLE and FORCE row-level security`);
    const permissive = policies.filter(row => row.permissive === 'PERMISSIVE');
    const baseline = permissive.filter(row => row.policy_name === 'tenant_isolation');
    if (baseline.length !== 1)
      throw new Error(`Tenant table ${table} has a missing or duplicate tenant isolation policy`);
    for (const policy of permissive) {
      const isBaseline = policy.policy_name === 'tenant_isolation';
      const validUsing = isBaseline
        ? tenantPredicate.test(policy.using_expression ?? '') && !/\bOR\b/i.test(policy.using_expression ?? '')
        : legacyBillingNames.has(policy.policy_name ?? '') && legacyBillingPredicate(policy.using_expression);
      const validCheck = isBaseline
        ? tenantPredicate.test(policy.check_expression ?? '') && !/\bOR\b/i.test(policy.check_expression ?? '')
        : legacyBillingNames.has(policy.policy_name ?? '') && legacyBillingPredicate(policy.check_expression);
      if (policy.command !== 'ALL' || !validUsing || !validCheck)
        throw new Error(`Tenant table ${table} has an unsafe or incomplete permissive RLS policy`);
    }
  }
  return tables.size;
}

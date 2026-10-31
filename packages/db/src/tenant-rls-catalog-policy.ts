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

/**
 * pg_policies emits normalized SQL (with optional whitespace, grouping
 * parentheses and implicit ::text casts). A substring/OR blacklist is unsafe:
 * COALESCE(tenant_id = app_current_tenant(), true), for example, admits rows
 * when the tenant setting is absent without ever containing an OR token.
 *
 * Match only the reviewed, complete tenant predicates. A new policy syntax
 * must be explicitly reviewed and tested rather than guessed safe.
 */
const canonicalPredicate = (expression: string | null): boolean => {
  const normalized = (expression ?? '').replace(/[\s()]/g, '').toLowerCase();
  return normalized === 'tenant_id=app_current_tenant' ||
    normalized === 'tenant_id=public.app_current_tenant';
};

const legacyBillingNames = new Set([
  'tenant_subscriptions_isolation', 'subscription_events_isolation',
  'tenant_profiles_isolation', 'tenant_invitations_isolation',
  'billing_tenant_isolation', 'billing_stripe_tenant_isolation',
  'billing_payment_exception_tenant_isolation',
]);

const legacyBillingPredicate = (expression: string | null): boolean => {
  const normalized = (expression ?? '').replace(/[\s()]/g, '').toLowerCase();
  // PostgreSQL pg_get_expr may add implicit text casts to either literal.
  const prefix = "tenant_id=nullifcurrent_setting'app.tenant_id'";
  for (const settingCast of ['', '::text']) {
    for (const emptyCast of ['', '::text']) {
      if (normalized === `${prefix}${settingCast},true,''${emptyCast}::uuid`)
        return true;
    }
  }
  return false;
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
        ? canonicalPredicate(policy.using_expression)
        : legacyBillingNames.has(policy.policy_name ?? '') && legacyBillingPredicate(policy.using_expression);
      const validCheck = isBaseline
        ? canonicalPredicate(policy.check_expression)
        : legacyBillingNames.has(policy.policy_name ?? '') && legacyBillingPredicate(policy.check_expression);
      if (policy.command !== 'ALL' || !validUsing || !validCheck)
        throw new Error(`Tenant table ${table} has an unsafe or incomplete permissive RLS policy`);
    }
  }
  return tables.size;
}

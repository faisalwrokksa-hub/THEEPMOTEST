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

const tenantPredicate = /\\btenant_id\\s*=\\s*(?:public\\.)?app_current_tenant\\(\\)/i;

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
    if (permissive.length !== 1 || permissive[0].policy_name !== 'tenant_isolation')
      throw new Error(`Tenant table ${table} has a missing or additional permissive RLS policy`);
    const policy = permissive[0];
    if (policy.command !== 'ALL' ||
        !tenantPredicate.test(policy.using_expression ?? '') ||
        !tenantPredicate.test(policy.check_expression ?? ''))
      throw new Error(`Tenant table ${table} has an incomplete tenant isolation policy`);
  }
  return tables.size;
}

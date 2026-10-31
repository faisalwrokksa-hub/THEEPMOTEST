/** Security acceptance must use the real restricted application principal. */
export function assertRestrictedVerifierRole(role: {
  name: string; superuser: boolean; bypassrls: boolean;
} | undefined): void {
  if (!role || role.name !== 'pmo_app' || role.superuser || role.bypassrls) {
    throw new Error('RLS verification requires the restricted pmo_app role without SUPERUSER or BYPASSRLS');
  }
}

/** A deny-all policy is not evidence of correct cross-tenant isolation. */
export function tenantRowsVisibleAndIsolated(
  rows: ReadonlyArray<{ tenant_id: string }>, tenantId: string,
): boolean {
  return rows.length > 0 && rows.every((row) => row.tenant_id === tenantId);
}

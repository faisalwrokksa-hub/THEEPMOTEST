/** Validate the complete session shape before passing it to privileged UI.
 * The API remains the authority for authentication and tenant membership.
 * A truncated success response must never be treated as a valid session:
 * TenantSwitcher dereferences displayName, role and every tenant's name/role.
 */
const nonEmptyText = (value) => typeof value === 'string' && value.trim().length > 0;

export function validSessionEnvelope(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  if (value.authenticated === false) return true;
  if (value.authenticated !== true) return false;

  if (!nonEmptyText(value.userId) ||
      !nonEmptyText(value.email) ||
      !nonEmptyText(value.displayName) ||
      !nonEmptyText(value.tenantId) ||
      !nonEmptyText(value.tenantName) ||
      !nonEmptyText(value.role) ||
      !Array.isArray(value.capabilities) ||
      !value.capabilities.every(nonEmptyText) ||
      !Array.isArray(value.tenants) ||
      value.tenants.length === 0) return false;

  const ids = new Set();
  for (const tenant of value.tenants) {
    if (!tenant || typeof tenant !== 'object' || Array.isArray(tenant) ||
        !nonEmptyText(tenant.tenantId) ||
        !nonEmptyText(tenant.name) ||
        !nonEmptyText(tenant.slug) ||
        !nonEmptyText(tenant.role) ||
        ids.has(tenant.tenantId)) return false;
    ids.add(tenant.tenantId);
  }

  // A malformed active-tenant mapping must not render a workspace switcher.
  return value.tenants.some((tenant) =>
    tenant.tenantId === value.tenantId && tenant.role === value.role);
}

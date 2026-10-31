/** Validate the minimum trusted session envelope before rendering privileged UI.
 * Never treat a malformed or truncated authenticated response as a sign-out.
 * The API remains the authority for signature, tenant and capability checks.
 */
export function validSessionEnvelope(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  if (value.authenticated === false) return true;
  return value.authenticated === true &&
    typeof value.userId === 'string' && value.userId.length > 0 &&
    typeof value.tenantId === 'string' && value.tenantId.length > 0 &&
    Array.isArray(value.capabilities) &&
    value.capabilities.every(capability => typeof capability === 'string') &&
    Array.isArray(value.tenants);
}

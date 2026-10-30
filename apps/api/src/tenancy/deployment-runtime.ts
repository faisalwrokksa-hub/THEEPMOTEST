/**
 * E12: validate the server's deployment inventory once at boot, not from any
 * client header. Phased rollout: deployments without a profile retain the
 * legacy shared-tenant path; no dedicated deployment may omit this inventory.
 *
 * This controls API routing authorization, not physical hosting, database
 * provisioning or immutable DB registry persistence (separate P0 gates).
 */
import { parseDeploymentBinding, resolveAuthorizedDeployment,
  type DeploymentBinding, type DeploymentProfile } from '@pmo/contracts';

export type RuntimeDeployment = Readonly<{
  profile: DeploymentProfile;
  deploymentId: string;
  region: string;
  apiOrigin: string;
  tenantBindings: ReadonlyMap<string, DeploymentBinding>;
}>;

export function parseRuntimeDeployment(env: NodeJS.ProcessEnv): RuntimeDeployment | null {
  const keys = ['EPMO_DEPLOYMENT_PROFILE', 'EPMO_DEPLOYMENT_ID', 'EPMO_DEPLOYMENT_REGION',
    'EPMO_DEPLOYMENT_API_ORIGIN', 'EPMO_ALLOWED_DEPLOYMENT_REGIONS',
    'EPMO_DEPLOYMENT_BINDINGS_JSON'] as const;
  const profile = env.EPMO_DEPLOYMENT_PROFILE;
  if (!profile) {
    if (keys.some(key => Boolean(env[key]))) throw new Error('Partial EPMO deployment configuration');
    return null; // Legacy shared deployments: not accepted as dedicated isolation proof.
  }
  if (profile !== 'shared' && profile !== 'dedicated') throw new Error('Unknown EPMO deployment profile');
  const deploymentId = env.EPMO_DEPLOYMENT_ID;
  const region = env.EPMO_DEPLOYMENT_REGION;
  const apiOrigin = env.EPMO_DEPLOYMENT_API_ORIGIN;
  const allowedRegions = env.EPMO_ALLOWED_DEPLOYMENT_REGIONS?.split(',')
    .map(s => s.trim()).filter(Boolean) ?? [];
  if (!deploymentId || !region || !apiOrigin || !allowedRegions.includes(region))
    throw new Error('Incomplete approved deployment runtime identity');
  let parsed: unknown;
  try { parsed = JSON.parse(env.EPMO_DEPLOYMENT_BINDINGS_JSON ?? ''); }
  catch { throw new Error('Invalid server deployment inventory'); }
  if (!Array.isArray(parsed) || parsed.length < 1 || parsed.length > 10000)
    throw new Error('Empty or oversized deployment inventory');
  const bindings = new Map<string, DeploymentBinding>();
  for (const raw of parsed) {
    const binding = parseDeploymentBinding(raw, {
      regions: allowedRegions, apiOrigins: [apiOrigin],
    });
    if (binding.profile !== profile || binding.deploymentId !== deploymentId ||
        binding.region !== region || binding.apiOrigin !== apiOrigin ||
        bindings.has(binding.tenantId))
      throw new Error('Conflicting or cross-deployment tenant binding');
    bindings.set(binding.tenantId, binding);
  }
  if (profile === 'dedicated' && bindings.size !== 1)
    throw new Error('Dedicated runtime must authorize exactly one tenant');
  return { profile, deploymentId, region, apiOrigin, tenantBindings: bindings };
}

/** Operates only on the resolved server session principal, never on request headers. */
export function assertRuntimeDeploymentTenant(runtime: RuntimeDeployment | null,
  principal: { tenantId: string; userId: string }): void {
  if (!runtime) return; // Compatibility until registry-backed rollout is complete.
  const binding = runtime.tenantBindings.get(principal.tenantId);
  if (!binding) throw new Error('Tenant is not assigned to this deployment');
  resolveAuthorizedDeployment({
    authenticatedUserId: principal.userId,
    membershipUserId: principal.userId,
    membershipTenantId: principal.tenantId,
    requestedTenantId: principal.tenantId,
    runtimeDeploymentId: runtime.deploymentId,
    runtimeRegion: runtime.region,
    binding,
  });
}

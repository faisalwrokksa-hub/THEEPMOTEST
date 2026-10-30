/**
 * A02/A03: server-authoritative tenant/deployment contract and routing guard.
 * A design-level policy primitive. Persistence, OAuth and physical isolation
 * are separate acceptance gates; this module does not provision infrastructure.
 */
export type DeploymentProfile = 'shared' | 'dedicated';
export type DeploymentBinding = Readonly<{
  tenantId: string;
  deploymentId: string;
  profile: DeploymentProfile;
  region: string;
  dataResidency: 'SA';
  databaseIsolation: 'shared-rls' | 'dedicated';
  keyIsolation: 'tenant-context' | 'dedicated';
  apiOrigin: string;
}>;
export type DeploymentAllowlist = Readonly<{ regions: readonly string[]; apiOrigins: readonly string[] }>;
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function fail(): never { throw new Error('Untrusted or unauthorized deployment binding'); }
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail();
  return value as Record<string, unknown>;
}
function validOrigin(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.origin === value &&
      !url.username && !url.password && !url.search && !url.hash &&
      url.pathname === '/' && url.hostname.includes('.') &&
      !url.hostname.endsWith('.localhost') && !url.hostname.endsWith('.local');
  } catch { return false; }
}

/** Reject anything not explicitly approved by the server's immutable inventory. */
export function parseDeploymentBinding(input: unknown, allow: DeploymentAllowlist): DeploymentBinding {
  const v = record(input);
  const keys = ['tenantId', 'deploymentId', 'profile', 'region', 'dataResidency',
    'databaseIsolation', 'keyIsolation', 'apiOrigin'];
  if (Object.keys(v).some(k => !keys.includes(k)) || keys.some(k => !(k in v))) return fail();
  if (typeof v.tenantId !== 'string' || !ID.test(v.tenantId) ||
      typeof v.deploymentId !== 'string' || !ID.test(v.deploymentId) ||
      (v.profile !== 'shared' && v.profile !== 'dedicated') ||
      v.dataResidency !== 'SA' ||
      typeof v.region !== 'string' || !allow.regions.includes(v.region) ||
      !validOrigin(v.apiOrigin) || !allow.apiOrigins.includes(v.apiOrigin)) return fail();
  if (v.profile === 'shared' &&
      (v.databaseIsolation !== 'shared-rls' || v.keyIsolation !== 'tenant-context')) return fail();
  if (v.profile === 'dedicated' &&
      (v.databaseIsolation !== 'dedicated' || v.keyIsolation !== 'dedicated')) return fail();
  return Object.freeze({
    tenantId: v.tenantId, deploymentId: v.deploymentId,
    profile: v.profile, region: v.region, dataResidency: 'SA',
    databaseIsolation: v.databaseIsolation, keyIsolation: v.keyIsolation, apiOrigin: v.apiOrigin,
  }) as DeploymentBinding;
}

/** Bindings cannot be switched in place, including shared -> dedicated migration. */
export function assertImmutableDeploymentBinding(existing: DeploymentBinding,
  candidate: DeploymentBinding): void {
  for (const key of Object.keys(existing) as (keyof DeploymentBinding)[]) {
    if (existing[key] !== candidate[key]) return fail();
  }
}

/** All identity/membership/runtime values must originate in trusted server context. */
export function resolveAuthorizedDeployment(input: {
  authenticatedUserId: string | null | undefined;
  membershipUserId: string | null | undefined;
  membershipTenantId: string | null | undefined;
  requestedTenantId: string | null | undefined;
  runtimeDeploymentId: string | null | undefined;
  runtimeRegion: string | null | undefined;
  binding: DeploymentBinding;
}): { deploymentId: string; apiOrigin: string; tenantId: string } {
  const { binding: b } = input;
  if (!input.authenticatedUserId || !input.membershipUserId ||
      input.authenticatedUserId !== input.membershipUserId ||
      !input.membershipTenantId || input.membershipTenantId !== b.tenantId ||
      input.requestedTenantId !== b.tenantId ||
      input.runtimeDeploymentId !== b.deploymentId ||
      input.runtimeRegion !== b.region) return fail();
  return { deploymentId: b.deploymentId, apiOrigin: b.apiOrigin, tenantId: b.tenantId };
}

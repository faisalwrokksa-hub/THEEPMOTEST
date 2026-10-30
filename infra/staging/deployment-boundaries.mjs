/**
 * A04/A05/A06: read-only staging inventory isolation gate.
 * Names and flags cannot prove physical isolation or regulatory approval:
 * provider verification, encrypted restore and independent runtime tests remain
 * mandatory before approving a customer environment.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const IDENTIFIER = /^[a-z][a-z0-9-]{4,62}$/;
const RESOURCE_KEYS = ['runtime','database','storage','kms','audit','backup'];

function valid(item) {
  return item && typeof item === 'object' && !Array.isArray(item);
}
/** Validate the metadata-only boundary plan; reject any cross-deployment collision. */
export function verifyDeploymentIsolationMatrix(deployments, approvedRegions) {
  const checks = [];
  if (!Array.isArray(deployments) || deployments.length < 2 ||
      !Array.isArray(approvedRegions) || approvedRegions.length === 0)
    return [{ name: 'Valid staged deployment matrix', passed: false }];
  const seen = new Map();
  for (const [index, row] of deployments.entries()) {
    const prefix = 'Deployment ' + (index + 1);
    const obj = valid(row) ? row : {};
    const resources = valid(obj.resources) ? obj.resources : {};
    checks.push({name: prefix + ' has strict server-owned metadata only',
      passed: Object.keys(obj).sort().join(',') ===
        ['dataResidency','deploymentId','profile','region','resources','tenantId'].sort().join(',')});
    checks.push({name: prefix + ' has approved Saudi region and opaque identities',
      passed: UUID.test(String(obj.tenantId || '')) && UUID.test(String(obj.deploymentId || '')) &&
        obj.dataResidency === 'SA' && approvedRegions.includes(obj.region)});
    checks.push({name: prefix + ' uses a known profile and complete dedicated resource labels',
      passed: ['shared','dedicated'].includes(obj.profile) &&
        Object.keys(resources).sort().join(',') === RESOURCE_KEYS.slice().sort().join(',') &&
        RESOURCE_KEYS.every(key => typeof resources[key] === 'string' && IDENTIFIER.test(resources[key]))});
    for (const key of RESOURCE_KEYS) {
      const value = resources[key];
      if (typeof value !== 'string') continue;
      const collisionKey = key + ':' + value;
      const previous = seen.get(collisionKey);
      // Shared tenants may intentionally use the same deployment, but
      // distinct deployments (and every dedicated deployment) may not.
      const isolated = previous === undefined || (obj.profile === 'shared' &&
        previous.profile === 'shared' && previous.deploymentId === obj.deploymentId);
      checks.push({name: prefix + ' ' + key + ' isolated from other deployments',passed:isolated});
      if (previous === undefined) seen.set(collisionKey,{profile:obj.profile,deploymentId:obj.deploymentId});
    }
  }
  return checks;
}

/** Safeguard: inventory labels alone must never turn the production gate green. */
export function deploymentOperationalReadiness(evidence) {
  return evidence?.providerApproved === true && evidence?.physicalIsolationVerified === true &&
    evidence?.tlsVerified === true && evidence?.encryptedBackupRestored === true &&
    evidence?.rollbackRehearsed === true && evidence?.tenantNegativeTestsPassed === true &&
    evidence?.telemetryRedactionVerified === true && evidence?.securityApproved === true;
}

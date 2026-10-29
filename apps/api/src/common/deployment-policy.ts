/**
 * A deployed server must use secure browser and integration transport even if
 * NODE_ENV was accidentally set to development. Missing DEPLOYMENT_ENV is
 * permitted only for local development; loadEnv validates named modes.
 */
export function requiresSecureTransport(nodeEnv?: string, deploymentEnv?: string): boolean {
  return nodeEnv === 'production' || deploymentEnv === 'production' || deploymentEnv === 'staging';
}

/**
 * S37: fail-closed runtime boundary for the synthetic S34 off-host drill.
 * No DNS, network, Docker, AWS or filesystem mutation occurs in these helpers.
 */
import { lstatSync } from 'node:fs';

export const LOCAL_DOCKER_SOCKET = '/var/run/docker.sock';
const forbidden = [
  'AWS_PROFILE', 'AWS_DEFAULT_PROFILE', 'AWS_CONFIG_FILE', 'AWS_SHARED_CREDENTIALS_FILE',
  'AWS_WEB_IDENTITY_TOKEN_FILE', 'AWS_ROLE_ARN', 'AWS_ROLE_SESSION_NAME',
  'AWS_CONTAINER_CREDENTIALS_FULL_URI', 'AWS_CONTAINER_CREDENTIALS_RELATIVE_URI',
  'AWS_EC2_METADATA_SERVICE_ENDPOINT', 'AWS_CA_BUNDLE',
];
const unsafeName = name => /^DOCKER(?:_|$)/.test(name) || /^AWS_ENDPOINT_URL(?:_|$)/.test(name) ||
  /^PG[A-Z_]+$/.test(name) || forbidden.includes(name);

export function assertSyntheticRecoveryRuntime(env, socketCheck = path => {
  try { return lstatSync(path).isSocket(); } catch { return false; }
}) {
  if (Object.keys(env).some(name => unsafeName(name) && Boolean(env[name])))
    throw new Error('Refusing inherited Docker, database or AWS credential routing overrides');
  if (!socketCheck(LOCAL_DOCKER_SOCKET))
    throw new Error('A local, non-symlink Docker Unix socket is required');
}

export function isolatedDockerCommand(args, env) {
  if (!Array.isArray(args) || args.some(x => typeof x !== 'string'))
    throw new Error('Invalid Docker arguments');
  return {
    args: ['--host', 'unix://' + LOCAL_DOCKER_SOCKET, ...args],
    env: { PATH: env.PATH || '/usr/bin:/bin', HOME: '/nonexistent' },
  };
}

export function isolatedAwsEnvironment(env) {
  if (Object.keys(env).some(name => unsafeName(name) && Boolean(env[name])))
    throw new Error('Refusing inherited AWS credential routing overrides');
  // Explicit, short-lived TEST-only credentials must be supplied by the operator.
  // Do not fall back to instance metadata, profiles or the user's ~/.aws files.
  if (!env.AWS_ACCESS_KEY_ID || !env.AWS_SECRET_ACCESS_KEY)
    throw new Error('Explicit synthetic-drill AWS credentials are required');
  const region = env.AWS_DEFAULT_REGION || env.AWS_REGION;
  if (!/^[a-z]{2}(?:-gov)?-[a-z0-9-]+-\d$/.test(region || '') ||
      (env.AWS_DEFAULT_REGION && env.AWS_REGION && env.AWS_DEFAULT_REGION !== env.AWS_REGION))
    throw new Error('An unambiguous AWS region is required');
  return {
    PATH: env.PATH || '/usr/bin:/bin', HOME: '/nonexistent',
    AWS_ACCESS_KEY_ID: env.AWS_ACCESS_KEY_ID,
    AWS_SECRET_ACCESS_KEY: env.AWS_SECRET_ACCESS_KEY,
    ...(env.AWS_SESSION_TOKEN ? { AWS_SESSION_TOKEN: env.AWS_SESSION_TOKEN } : {}),
    AWS_DEFAULT_REGION: region,
    AWS_EC2_METADATA_DISABLED: 'true',
    AWS_PAGER: '',
  };
}

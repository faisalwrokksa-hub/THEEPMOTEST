import test from 'node:test';
import assert from 'node:assert/strict';
import { assertSyntheticRecoveryRuntime, isolatedDockerCommand,
  isolatedAwsEnvironment, LOCAL_DOCKER_SOCKET } from './staging-recovery-runtime-boundary.mjs';

const safe = () => ({ PATH: '/usr/bin:/bin', AWS_ACCESS_KEY_ID: 'TEST_ONLY_KEY',
  AWS_SECRET_ACCESS_KEY: 'TEST_ONLY_SECRET', AWS_REGION: 'eu-central-1' });

test('S37 refuses missing or nonlocal Docker socket before external operations', () => {
  assert.throws(() => assertSyntheticRecoveryRuntime(safe(), () => false), /local.*socket/);
  let checked;
  assert.doesNotThrow(() => assertSyntheticRecoveryRuntime(safe(), path => {
    checked = path; return true;
  }));
  assert.equal(checked, LOCAL_DOCKER_SOCKET);
});

test('S37 rejects Docker context, database overrides, AWS profiles and endpoint redirects', () => {
  const overrides = [
    ['DOCKER_HOST', 'tcp://prod.example:2376'], ['DOCKER_CONTEXT', 'prod'],
    ['DOCKER_CONFIG', '/tmp/prod'], ['DOCKER_TLS_VERIFY', '1'],
    ['PGSERVICE', 'production'], ['AWS_PROFILE', 'production'],
    ['AWS_DEFAULT_PROFILE', 'production'], ['AWS_CONFIG_FILE', '/tmp/config'],
    ['AWS_SHARED_CREDENTIALS_FILE', '/tmp/creds'],
    ['AWS_WEB_IDENTITY_TOKEN_FILE', '/tmp/token'],
    ['AWS_CONTAINER_CREDENTIALS_FULL_URI', 'http://169.254.170.2/'],
    ['AWS_ENDPOINT_URL_S3', 'https://internal.example'],
    ['AWS_EC2_METADATA_SERVICE_ENDPOINT', 'http://localhost'],
  ];
  for (const [name, value] of overrides) {
    assert.throws(() => assertSyntheticRecoveryRuntime({ ...safe(), [name]: value }, () => true), name);
    assert.throws(() => isolatedAwsEnvironment({ ...safe(), [name]: value }), name);
  }
});

test('S37 Docker CLI is pinned to local Unix socket and cannot inherit secrets', () => {
  const cmd = isolatedDockerCommand(['run', '--network', 'none'], {
    ...safe(), HOME: '/home/prod', DOCKER_HOST: 'tcp://prod:2376',
    DATABASE_URL: 'postgres://prod', STRIPE_SECRET_KEY: 'sk_live_example',
  });
  assert.deepEqual(cmd.args, ['--host', 'unix:///var/run/docker.sock', 'run', '--network', 'none']);
  assert.deepEqual(cmd.env, { PATH: '/usr/bin:/bin', HOME: '/nonexistent' });
});

test('S37 AWS CLI has explicit credentials and region without profile or metadata fallback', () => {
  const env = isolatedAwsEnvironment({ ...safe(), HOME: '/home/prod',
    AWS_SESSION_TOKEN: 'TEST_ONLY_SESSION', STRIPE_SECRET_KEY: 'sk_live_should_not_pass' });
  assert.deepEqual(Object.keys(env).sort(), [
    'AWS_ACCESS_KEY_ID', 'AWS_DEFAULT_REGION', 'AWS_EC2_METADATA_DISABLED',
    'AWS_PAGER', 'AWS_SECRET_ACCESS_KEY', 'AWS_SESSION_TOKEN', 'HOME', 'PATH',
  ].sort());
  assert.equal(env.HOME, '/nonexistent');
  assert.equal(env.AWS_DEFAULT_REGION, 'eu-central-1');
  assert.equal(env.AWS_EC2_METADATA_DISABLED, 'true');
  assert.equal(env.STRIPE_SECRET_KEY, undefined);
});

test('S37 refuses ambiguous region and missing explicit credentials', () => {
  for (const e of [{ ...safe(), AWS_SECRET_ACCESS_KEY: '' },
    { ...safe(), AWS_REGION: '' },
    { ...safe(), AWS_DEFAULT_REGION: 'us-east-1' },
    { ...safe(), AWS_REGION: 'http://example.com' }])
    assert.throws(() => isolatedAwsEnvironment(e));
});

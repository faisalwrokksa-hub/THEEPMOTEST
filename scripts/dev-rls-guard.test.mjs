import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, chmodSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const apply = fileURLToPath(new URL('../packages/db/scripts/apply-rls.sh', import.meta.url));
const dir = mkdtempSync(join(tmpdir(), 'epmo-s24-'));
const commandFile = join(dir, 'docker-command');
const sqlFile = join(dir, 'docker-stdin');
const docker = join(dir, 'docker');
writeFileSync(docker, `#!/bin/sh
if [ "$1" = context ] && [ "$2" = show ]; then echo "${S24_CONTEXT:-default}"; exit 0; fi
if [ "$1" = context ] && [ "$2" = inspect ]; then echo "${S24_ENDPOINT:-unix:///var/run/docker.sock}"; exit 0; fi
printf '%s\\n' "$*" > "$S24_COMMAND"
cat > "$S24_SQL"
`);
chmodSync(docker, 0o700);
after(() => rmSync(dir, { recursive: true, force: true }));
const clean = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
  !['DEPLOYMENT_ENV','NODE_ENV','DOCKER_HOST','DOCKER_CONTEXT','COMPOSE_FILE',
    'COMPOSE_PROJECT_NAME','DOCKER_TLS_VERIFY','DOCKER_CERT_PATH',
    'EPMO_DEPLOYMENT_PROFILE','EPMO_DEPLOYMENT_ID','EPMO_DEPLOYMENT_REGION',
    'EPMO_DEPLOYMENT_API_ORIGIN','PMO_PG_CONTAINER'].includes(key)));
function run(overrides = {}) {
  rmSync(commandFile, { force: true });
  rmSync(sqlFile, { force: true });
  const result = spawnSync('bash', [apply], {
    encoding: 'utf8',
    env: { ...clean, DEPLOYMENT_ENV: 'development',
      PATH: `${dir}:${process.env.PATH}`, S24_COMMAND: commandFile,
      S24_SQL: sqlFile, ...overrides },
  });
  return { result,
    command: existsSync(commandFile) ? readFileSync(commandFile, 'utf8') : '',
    sql: existsSync(sqlFile) ? readFileSync(sqlFile, 'utf8') : '' };
}
test('S24 RLS applies through the pinned Compose postgres service with SQL on stdin', () => {
  const { result, command, sql } = run();
  assert.equal(result.status, 0, result.stderr);
  assert.match(command, /^compose --project-name pmo-dev --file .*\/docker-compose\.yml exec -T postgres psql -X -v ON_ERROR_STOP=1 -U postgres -d pmo\n$/);
  assert.match(sql, /Row-level security: the tenant boundary/);
  assert.match(sql, /CREATE OR REPLACE FUNCTION app_current_tenant/);
});
test('S24 ignores caller-supplied global container name', () => {
  const { result, command } = run({ PMO_PG_CONTAINER: 'production-postgres' });
  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(command, /production-postgres/);
  assert.match(command, /exec -T postgres psql/);
});
test('S24 blocks staging, production, and remote Docker endpoints before SQL execution', () => {
  for (const env of [
    { DEPLOYMENT_ENV: 'staging' }, { DEPLOYMENT_ENV: 'production' },
    { NODE_ENV: 'production' }, { DOCKER_HOST: 'tcp://remote.example:2376' },
    { DOCKER_CONTEXT: 'remote' }, { S24_CONTEXT: 'remote' },
    { S24_ENDPOINT: 'tcp://remote.example:2376' },
    { EPMO_DEPLOYMENT_PROFILE: 'dedicated' }, { COMPOSE_FILE: 'other.yml' },
  ]) {
    const { result, command } = run(env);
    assert.equal(result.status, 2, JSON.stringify(env) + ': ' + result.stderr);
    assert.equal(command, '', JSON.stringify(env));
  }
});

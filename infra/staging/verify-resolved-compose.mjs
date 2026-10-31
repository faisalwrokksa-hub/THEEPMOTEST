#!/usr/bin/env node
/**
 * Read-only, fail-closed validation of the FINAL resolved staging Compose model.
 * Accepts JSON on stdin, never prints config values (which can contain secrets).
 * No Docker, network, database, DNS or host operation is performed.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const requiredServices = ['postgres', 'redis', 'api', 'web', 'staging-edge'];
const expectedNetworks = {
  postgres: ['staging-data'], redis: ['staging-data'],
  api: ['staging-app', 'staging-data'], web: ['staging-app'],
  'staging-edge': ['staging-app'],
};
const shaPattern = /^[a-f0-9]{40}$/;
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const keys = value => isObject(value) ? Object.keys(value).sort() : [];
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function urlOnService(value, protocols, hostname, port) {
  try {
    const url = new URL(value);
    return protocols.includes(url.protocol) && url.hostname === hostname &&
      (!url.port || url.port === String(port)) && !url.search && !url.hash;
  } catch { return false; }
}
function safePort(ports, target) {
  return Array.isArray(ports) && ports.length === 1 &&
    ports[0]?.host_ip === '127.0.0.1' && Number(ports[0]?.target) === target &&
    /^\d+$/.test(String(ports[0]?.published)) &&
    Number(ports[0].published) >= 1024 && Number(ports[0].published) <= 65535;
}

export function inspectResolvedStagingCompose(config, candidateSha) {
  const services = isObject(config?.services) ? config.services : {};
  const networks = isObject(config?.networks) ? config.networks : {};
  const volumes = isObject(config?.volumes) ? config.volumes : {};
  const apiEnv = isObject(services.api?.environment) ? services.api.environment : {};
  const webEnv = isObject(services.web?.environment) ? services.web.environment : {};
  const checks = [];
  const add = (name, passed) => checks.push({ name, passed: Boolean(passed) });

  add('Exact isolated staging Compose project', config?.name === 'pmo-staging');
  add('Required staging services exist', requiredServices.every(name => isObject(services[name])));
  add('Only approved staging networks are declared', same(keys(networks), ['staging-app', 'staging-data']));
  add('Data network is internal and neither network is external',
    networks['staging-data']?.internal === true &&
    networks['staging-data']?.external !== true &&
    networks['staging-app']?.external !== true);
  add('Every service uses only its assigned staging networks',
    requiredServices.every(name => same(keys(services[name]?.networks), expectedNetworks[name])));
  add('No host-network or privileged service overrides', requiredServices.every(name => {
    const s = services[name];
    return isObject(s) && !s.network_mode && s.privileged !== true &&
      s.pid !== 'host' && s.ipc !== 'host' && s.userns_mode !== 'host';
  }));
  add('PostgreSQL, Redis and API have no published ports',
    ['postgres', 'redis', 'api'].every(name => services[name]?.ports === undefined));
  add('Web and TLS edge bind exactly one loopback-only host port',
    safePort(services.web?.ports, 3000) && safePort(services['staging-edge']?.ports, 8443) &&
    String(services.web.ports[0].published) !== String(services['staging-edge'].ports[0].published));
  add('PostgreSQL volume belongs to staging project and is not external',
    volumes.pgdata?.name === 'pmo-staging_pgdata' && volumes.pgdata?.external !== true &&
    Array.isArray(services.postgres?.volumes) &&
    services.postgres.volumes.some(v => v.source === 'pgdata' && v.target === '/var/lib/postgresql/data') &&
    requiredServices.filter(name => name !== 'postgres').every(name =>
      !(services[name]?.volumes || []).some(v => v.source === 'pgdata')));
  add('Application images match one exact immutable candidate SHA',
    shaPattern.test(String(candidateSha || '')) &&
    services.api?.image === 'epmo-staging-api:sha-' + candidateSha &&
    services.web?.image === 'epmo-staging-web:sha-' + candidateSha);
  add('Staging API runtime and database/cache service endpoints are isolated',
    apiEnv.NODE_ENV === 'production' && apiEnv.DEPLOYMENT_ENV === 'staging' &&
    apiEnv.ALLOW_HEADER_AUTH === 'false' &&
    urlOnService(apiEnv.DATABASE_URL, ['postgres:', 'postgresql:'], 'postgres', 5432) &&
    urlOnService(apiEnv.REDIS_URL, ['redis:', 'rediss:'], 'redis', 6379));
  add('Staging web runtime and canonical API endpoint are isolated',
    webEnv.NODE_ENV === 'production' &&
    webEnv.NEXT_PUBLIC_API_URL === 'https://api-staging.theepmo.com' &&
    webEnv.WEB_ORIGIN === 'https://staging.theepmo.com' &&
    apiEnv.WEB_ORIGIN === 'https://staging.theepmo.com');
  add('Staging never receives live Stripe keys',
    !/^(?:sk|rk)_live_/.test(String(apiEnv.STRIPE_SECRET_KEY || '')) &&
    apiEnv.BILLING_REFERENCE_WEBHOOK_ENABLED === 'false');
  return checks;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 4 || process.argv[2] !== '--candidate-sha' ||
        !shaPattern.test(process.argv[3])) throw new Error('invalid arguments');
    // stdin only; no persisted resolved Compose JSON containing secrets.
    const config = JSON.parse(readFileSync(0, 'utf8'));
    const checks = inspectResolvedStagingCompose(config, process.argv[3]);
    for (const check of checks) console.log((check.passed ? 'PASS ' : 'BLOCKED ') + check.name);
    console.log(checks.filter(x => x.passed).length + '/' + checks.length + ' offline resolved-Compose safety checks');
    if (checks.some(x => !x.passed)) process.exitCode = 1;
  } catch {
    console.error('BLOCKED resolved staging Compose verification (details withheld)');
    process.exitCode = 1;
  }
}

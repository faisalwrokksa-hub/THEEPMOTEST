/** RC1 release preflight. Offline and dependency-free: never connects to Stripe
 * or PostgreSQL and never logs secret values. Intended to run before deployment.
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const envKeys = ['DATABASE_URL','WEB_ORIGIN','PUBLIC_API_URL','PG_USER','PG_PASSWORD','PG_DB',
  'REDIS_URL','REDIS_PASSWORD','STRIPE_ENABLED','STRIPE_SECRET_KEY','STRIPE_WEBHOOK_SECRET',
  'STRIPE_WEBHOOK_PUBLIC_URL','STRIPE_ALLOW_TEST_MODE_IN_PRODUCTION',
  'DEPLOYMENT_ENV','BILLING_REFERENCE_WEBHOOK_ENABLED','WEB_BIND'];

export function parseSimpleEnvFile(source) {
  if (typeof source !== 'string') throw new Error('Invalid environment file');
  const result = {};
  for (const [index, line] of source.split(/\r?\n/).entries()) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(trimmed);
    if (!match) throw new Error(`Invalid env-file syntax at line ${index + 1}`);
    const key = match[1];
    if (Object.hasOwn(result, key)) throw new Error(`Repeated env-file key ${key}`);
    let value = match[2].trim();
    if (value.startsWith('"') || value.startsWith("'")) {
      const quote = value[0];
      const end = value.indexOf(quote, 1);
      if (end < 0 || (value.slice(end + 1).trim() && !value.slice(end + 1).trim().startsWith('#')))
        throw new Error(`Unterminated/invalid quoted env value at line ${index + 1}`);
      value = value.slice(1, end);
    } else {
      value = value.split(/\s+#/)[0].trim();
    }
    // Refuse ambiguous shell and Compose interpolation: preflight and actual
    // Compose must agree on what is deployed. Use literal, securely generated secrets.
    if (value.includes('${') || value.includes('$('))
      throw new Error(`Variable interpolation is not supported by RC1 preflight (line ${index + 1})`);
    result[key] = value;
  }
  return result;
}

function httpsOrigin(input) {
  try {
    const url = new URL(input);
    return url.protocol === 'https:' && url.origin === input && !!url.hostname &&
      !url.username && !url.password && !url.hash && !url.search && url.hostname !== 'localhost';
  } catch { return false; }
}
function webhookMatches(origin, webhook) {
  if (!httpsOrigin(origin)) return false;
  try {
    const url = new URL(webhook);
    return url.protocol === 'https:' && url.origin === origin &&
      url.pathname === '/api/v1/billing/stripe-webhook' &&
      !url.search && !url.hash && !url.username && !url.password;
  } catch { return false; }
}
function goodPassword(password) {
  return typeof password === 'string' && password.length >= 16 &&
    !/^(CHANGE_ME|password|postgres|pmo_app|secret)$/i.test(password);
}
function dbAppUrl(value, db) {
  try {
    const url = new URL(value);
    return ['postgres:', 'postgresql:'].includes(url.protocol) && url.username === 'pmo_app' &&
      goodPassword(decodeURIComponent(url.password)) && url.hostname === 'postgres' &&
      ['','5432'].includes(url.port) && url.pathname === `/${db}` && !url.search && !url.hash;
  } catch { return false; }
}
function redisUrl(value, password) {
  try {
    const url = new URL(value);
    return url.protocol === 'redis:' && url.hostname === 'redis' &&
      decodeURIComponent(url.password) === password && ['','6379'].includes(url.port);
  } catch { return false; }
}

/** Return checks rather than throwing to present every blocker at once. */
export function validateRc1Configuration(env, mode) {
  if (!['staging','production'].includes(mode)) throw new Error('Expected staging or production mode');
  // Release preflight must reject a valid HTTPS URL for the wrong environment.
  // This is an offline origin allowlist, NOT proof of DNS/TLS reachability.
  const expectedOrigins = mode === 'staging'
    ? { web: 'https://staging.theepmo.com', api: 'https://api-staging.theepmo.com' }
    : { web: 'https://theepmo.com', api: 'https://api.theepmo.com' };
  const stripeMode = mode === 'staging' ? 'test' : 'live';
  const keyPattern = mode === 'staging' ? /^sk_test_[A-Za-z0-9]{12,}$/ : /^sk_live_[A-Za-z0-9]{12,}$/;
  return [
    ['Deployment mode matches this release target', env.DEPLOYMENT_ENV === mode],
    ['HTTPS web origin', httpsOrigin(env.WEB_ORIGIN)],
    ['HTTPS public API origin', httpsOrigin(env.PUBLIC_API_URL)],
    ['Canonical web origin matches deployment target', env.WEB_ORIGIN === expectedOrigins.web],
    ['Canonical API origin matches deployment target', env.PUBLIC_API_URL === expectedOrigins.api],
    // Only the TLS reverse proxy should be reachable from the public network.
    ['Web container host port is bound to loopback', !env.WEB_BIND || env.WEB_BIND === '127.0.0.1'],
    ['Stripe webhook matches public API origin and exact path', webhookMatches(env.PUBLIC_API_URL,env.STRIPE_WEBHOOK_PUBLIC_URL)],
    ['Stripe adapter enabled', env.STRIPE_ENABLED === 'true'],
    [`Stripe ${stripeMode} key configured`, keyPattern.test(env.STRIPE_SECRET_KEY || '')],
    ['Stripe webhook signing secret configured', /^whsec_[A-Za-z0-9]{16,}$/.test(env.STRIPE_WEBHOOK_SECRET || '')],
    ['Reference payment adapter remains disabled', env.BILLING_REFERENCE_WEBHOOK_ENABLED !== 'true'],
    ['Staging exception matches deployment mode', env.STRIPE_ALLOW_TEST_MODE_IN_PRODUCTION === (mode === 'staging' ? 'true' : 'false')],
    ['Database admin username is not the application role', !!env.PG_USER && env.PG_USER !== 'pmo_app' && env.PG_USER !== 'postgres'],
    ['Database admin password is non-default', goodPassword(env.PG_PASSWORD)],
    ['Application database URL uses restricted pmo_app role', dbAppUrl(env.DATABASE_URL,env.PG_DB || 'pmo')],
    ['Redis password is non-default', goodPassword(env.REDIS_PASSWORD)],
    ['Redis URL matches the configured Redis password', redisUrl(env.REDIS_URL,env.REDIS_PASSWORD)],
    ['No public test/demo origins', !/\.example\b|\.test\b/.test(`${env.WEB_ORIGIN} ${env.PUBLIC_API_URL}`)],
  ].map(([name, passed]) => ({name, passed: Boolean(passed)}));
}

function section(compose, serviceName, nextName) {
  const start = compose.indexOf(`\n  ${serviceName}:`);
  const end = nextName ? compose.indexOf(`\n  ${nextName}:`, start + 1) : compose.indexOf('\nvolumes:', start + 1);
  return start >= 0 && end > start ? compose.slice(start, end) : '';
}
/** Verify that Docker passes the *intended* env vars to server processes. */
export function validateRc1Repository(source) {
  const compose = source.compose;
  const api = section(compose, 'api', 'web');
  const web = section(compose, 'web');
  const stripeKeys = ['STRIPE_ENABLED', 'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET',
    'DEPLOYMENT_ENV', 'STRIPE_ALLOW_TEST_MODE_IN_PRODUCTION'];
  return [
    ['API container receives explicit Stripe config', stripeKeys.every(key => new RegExp(`^\\s+${key}:`, 'm').test(api))],
    ['Web container cannot receive Stripe secrets', !/STRIPE_(SECRET_KEY|WEBHOOK_SECRET)\s*:/.test(web)],
    ['Test/reference payment adapter disabled for deployed API', /BILLING_REFERENCE_WEBHOOK_ENABLED:\s*['"]?false/.test(api)],
    ['API header authentication disabled', /ALLOW_HEADER_AUTH:\s*['"]false['"]/.test(api)],
    ['Production API listens only on internal network', /expose:\s*\['4000'\]/.test(api) && !/\n\s+ports:/.test(api)],
    ['API boot checks Stripe staging/live mode', source.apiEnv.includes('Stripe staging requires sk_test credentials') && source.apiEnv.includes('STRIPE_ALLOW_TEST_MODE_IN_PRODUCTION')],
    ['Stripe settlement checks deployment mode', source.stripePolicy.includes("deploymentEnv === 'production'") && source.stripePolicy.includes("deploymentEnv === 'staging'") && source.stripePolicy.includes("if (deploymentEnv !== undefined && deploymentEnv !== '') return false")],
    ['CI migrates and checks financial RLS', source.ci.includes('bash scripts/apply-sql-migrations.sh') && source.ci.includes('assert-financial-rls.sql')],
    ['CI runs full typecheck and web build', source.ci.includes('pnpm typecheck') && source.ci.includes('pnpm --filter @pmo/web build')],
  ].map(([name,passed])=>({name,passed:Boolean(passed)}));
}

export function checkRepository(rootDir = root) {
  return validateRc1Repository({
    compose: readFileSync(resolve(rootDir,'docker-compose.prod.yml'),'utf8'),
    apiEnv: readFileSync(resolve(rootDir,'apps/api/src/common/env.ts'),'utf8'),
    stripePolicy: readFileSync(resolve(rootDir,'apps/api/src/platform/stripe-policy.ts'),'utf8'),
    ci: readFileSync(resolve(rootDir,'.github/workflows/ci.yml'),'utf8'),
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const repo = checkRepository();
  let checks = [...repo];
  if (args.length) {
    if (args.length !== 4 || args[0] !== '--mode' || args[2] !== '--env-file' ||
        !['staging','production'].includes(args[1])) {
      console.error('Usage: node scripts/rc1-release-gate.mjs [--mode staging|production --env-file PATH]');
      process.exit(2);
    }
    try {
      const config = parseSimpleEnvFile(readFileSync(resolve(args[3]),'utf8'));
      checks = [...checks, ...validateRc1Configuration(config,args[1])];
    } catch (error) { console.error(`BLOCKED configuration file: ${error.message}`); process.exit(1); }
  }
  for (const {name,passed} of checks) console.log(`${passed?'PASS':'BLOCKED'} ${name}`);
  console.log(`RC1 release preflight: ${checks.filter(x=>x.passed).length}/${checks.length} checks passed`);
  console.log('Offline only: does not build, contact Stripe, execute database migrations or prove production readiness.');
  if (checks.some(x=>!x.passed)) process.exitCode=1;
}

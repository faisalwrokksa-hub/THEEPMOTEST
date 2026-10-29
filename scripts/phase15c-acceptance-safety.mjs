/**
 * Destructive acceptance tests reseed demo tenants. Require explicit opt-in
 * AND proof that both database connections target the same local test database.
 * A loopback URL is not proof of disposal (SSH tunnels are possible), so the
 * acknowledgement is a separate, required step.
 */
export const DISPOSABLE_ACK = 'YES_RESEED_DISPOSABLE_TEST_DATABASE';

function fail(message) { throw new Error(`Billing acceptance blocked: ${message}`); }
function parseDatabase(value, label) {
  if (!value) fail(`${label} is required`);
  let url;
  try { url = new URL(value); } catch { fail(`${label} must be a valid URL`); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) fail(`${label} must use PostgreSQL`);
  if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
    fail(`${label} must be a loopback connection`);
  if (!url.pathname || url.pathname === '/') fail(`${label} must name a database`);
  if (!url.username || !url.password) fail(`${label} must contain credentials`);
  return url;
}

/** No secrets or database URLs are returned or written to logs. */
export function assertDisposableAcceptanceConfig(env) {
  if (env.PHASE15_BILLING_ACCEPTANCE !== 'true') return { enabled: false };
  if (env.NODE_ENV !== 'test') fail('NODE_ENV must equal test');
  if (env.DEPLOYMENT_ENV && !['test', 'ci'].includes(env.DEPLOYMENT_ENV))
    fail('cannot run in staging or production deployment mode');
  if (env.PHASE15_ACCEPT_DISPOSABLE_DB !== DISPOSABLE_ACK)
    fail('explicit disposable-database acknowledgement missing');
  const app = parseDatabase(env.DATABASE_URL, 'DATABASE_URL');
  const admin = parseDatabase(env.DATABASE_URL_ADMIN, 'DATABASE_URL_ADMIN');
  if (app.hostname !== admin.hostname || app.port !== admin.port ||
      app.pathname !== admin.pathname) fail('application and admin databases must match');
  if (app.username !== 'pmo_app') fail('app database role must be pmo_app');
  if (admin.username === app.username) fail('admin connection must use a distinct role');
  let api;
  try { api = new URL(env.TEST_API || 'http://localhost:4000'); }
  catch { fail('TEST_API must be a valid URL'); }
  if (api.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(api.hostname))
    fail('acceptance API must be a local HTTP test instance');
  if (api.username || api.password) fail('TEST_API must not embed credentials');
  return { enabled: true, database: app.pathname.slice(1), restrictedRole: 'pmo_app' };
}

/**
 * A demo reseed removes named workspaces and resets demo identities. It must
 * never run as an implicit side effect of a build or against a hosted database.
 * Loopback is a necessary (not sufficient) condition: an SSH tunnel can still
 * point at a real database, so require an explicit acknowledgement as well.
 */
export const DISPOSABLE_SEED_ACK = 'YES_RESEED_DISPOSABLE_TEST_DATABASE';

function databaseConnection(raw: string | undefined, label: string): URL {
  if (!raw) throw new Error(`${label} is required to seed demo data`);
  let url: URL;
  try { url = new URL(raw); }
  catch { throw new Error(`${label} must be a PostgreSQL URL`); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol))
    throw new Error(`${label} must be a PostgreSQL URL`);
  if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
    throw new Error(`${label} must point to a loopback database`);
  if (!url.username || !url.password || !url.pathname || url.pathname === '/')
    throw new Error(`${label} must specify credentials and a database name`);
  return url;
}

export function assertDisposableSeedSafety(env: Record<string, string | undefined>): void {
  if (!['test', 'development'].includes(env.NODE_ENV ?? ''))
    throw new Error('Demo seed requires NODE_ENV=test or development');
  if (env.DEPLOYMENT_ENV && env.DEPLOYMENT_ENV !== 'development')
    throw new Error('Demo seed cannot run on a deployed environment');
  if (env.PHASE15_ACCEPT_DISPOSABLE_DB !== DISPOSABLE_SEED_ACK)
    throw new Error('Demo seed requires explicit disposable-database acknowledgement');
  const app = databaseConnection(env.DATABASE_URL, 'DATABASE_URL');
  const admin = databaseConnection(env.DATABASE_URL_ADMIN, 'DATABASE_URL_ADMIN');
  if (app.hostname !== admin.hostname || app.port !== admin.port || app.pathname !== admin.pathname)
    throw new Error('Demo seed app and admin database connections must refer to the same database');
  if (app.username !== 'pmo_app' || admin.username === app.username)
    throw new Error('Demo seed requires a restricted pmo_app role and a separate admin role');
}

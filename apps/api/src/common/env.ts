import { z } from 'zod';
import { requiresSecureTransport } from './deployment-policy';

/**
 * Configuration is validated at boot, so a missing or unsafe value fails
 * immediately and loudly rather than at the first request that needs it.
 */
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DEPLOYMENT_ENV: z.enum(['development', 'staging', 'production']).optional(),
  DATABASE_URL: z.string().url(),
  API_PORT: z.coerce.number().int().positive().default(4000),
  WEB_ORIGIN: z.string().default('http://localhost:3000'),
  // Number of trusted reverse-proxy hops; 0 means direct internet exposure.
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(10).default(1),
  ALLOW_HEADER_AUTH: z.enum(['true', 'false']).default('false'),
  BILLING_REFERENCE_WEBHOOK_ENABLED: z.enum(['true', 'false']).default('false'),
  BILLING_REFERENCE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_ENABLED: z.enum(['true', 'false']).default('false'),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  LOGIN_RATE_LIMIT: z.coerce.number().int().positive().default(8),
  /*
   * Two independent session limits, both enforced on the server.
   *
   * The absolute window bounds the worst case: a session dies this long after
   * sign-in however heavily it has been used. The idle window closes the case
   * the absolute one cannot — an unattended laptop, or a stolen cookie nobody
   * has started using yet. Eight hours covers a working day without ejecting
   * anyone over lunch.
   */
  SESSION_IDLE_HOURS: z.coerce.number().positive().default(8),
  SESSION_ABSOLUTE_DAYS: z.coerce.number().positive().default(7),
});

export type Env = z.infer<typeof schema>;

export function loadEnv(): Env {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid configuration:\n${issues}`);
  }
  const env = parsed.data;
  const secureDeployment = requiresSecureTransport(env.NODE_ENV, env.DEPLOYMENT_ENV);

  // CORS accepts a comma-separated origin allowlist. Validate *every* entry,
  // not only the first one: an HTTP or wildcard origin must never be smuggled
  // into an otherwise HTTPS-only production configuration.
  const origins = env.WEB_ORIGIN.split(',').map((s) => s.trim());
  if (origins.some((origin) => !origin || origin === '*'))
    throw new Error('WEB_ORIGIN requires explicit, non-empty origins (wildcards are forbidden).');
  for (const origin of origins) {
    let url: URL;
    try { url = new URL(origin); }
    catch { throw new Error(`WEB_ORIGIN contains an invalid origin: ${origin}`); }
    if (!['http:', 'https:'].includes(url.protocol) || url.origin !== origin)
      throw new Error(`WEB_ORIGIN must contain origins only (scheme, hostname and optional port): ${origin}`);
    if (secureDeployment && url.protocol !== 'https:')
      throw new Error(`Every WEB_ORIGIN entry must use https in production: ${origin}`);
  }

  if (env.BILLING_REFERENCE_WEBHOOK_ENABLED === 'true' &&
      (!env.BILLING_REFERENCE_WEBHOOK_SECRET || Buffer.byteLength(env.BILLING_REFERENCE_WEBHOOK_SECRET) < 32))
    throw new Error('BILLING_REFERENCE_WEBHOOK_SECRET must be at least 32 bytes when the reference webhook is enabled.');

  if (env.STRIPE_ENABLED === 'true') {
    if (!env.STRIPE_SECRET_KEY || !/^sk_(test|live)_[A-Za-z0-9]+$/.test(env.STRIPE_SECRET_KEY) ||
        !env.STRIPE_WEBHOOK_SECRET || !/^whsec_[A-Za-z0-9]{16,}$/.test(env.STRIPE_WEBHOOK_SECRET))
      throw new Error('Stripe requires valid STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET when enabled.');
    // Staging uses the *production-compiled* API but must NEVER process live
    // Stripe payments. The billing service checks the same deployment boundary.
    const staging = env.DEPLOYMENT_ENV === 'staging';
    const testInProductionBuild = staging && process.env.STRIPE_ALLOW_TEST_MODE_IN_PRODUCTION === 'true';
    if (staging && !env.STRIPE_SECRET_KEY.startsWith('sk_test_'))
      throw new Error('Stripe staging requires sk_test credentials; live keys are forbidden.');
    if (secureDeployment && !env.STRIPE_SECRET_KEY.startsWith('sk_live_') && !testInProductionBuild)
      throw new Error('Production Stripe integration requires sk_live credentials unless staging is explicitly opted in.');
    if (secureDeployment && !staging && process.env.STRIPE_ALLOW_TEST_MODE_IN_PRODUCTION === 'true')
      throw new Error('Stripe staging exemption cannot be enabled in production.');
  }

  // The reference HMAC adapter is for controlled integration testing, never real billing.
  if (secureDeployment && env.BILLING_REFERENCE_WEBHOOK_ENABLED === 'true')
    throw new Error('Reference payment webhook must remain disabled in production; use a PSP-native adapter.');

  // Header impersonation is a local developer convenience, never a staging
  // integration strategy. Deployment identity must take precedence over NODE_ENV.
  if (env.ALLOW_HEADER_AUTH === 'true' &&
      (env.NODE_ENV !== 'development' ||
       (process.env.DEPLOYMENT_ENV && process.env.DEPLOYMENT_ENV !== 'development')))
    throw new Error('ALLOW_HEADER_AUTH requires local development mode, never staging or production.');

  if (secureDeployment) {
    if (/:(postgres|password|pmo_app)@/.test(env.DATABASE_URL))
      throw new Error('DATABASE_URL still uses a default development password.');
    if (env.LOGIN_RATE_LIMIT > 20)
      throw new Error(`LOGIN_RATE_LIMIT=${env.LOGIN_RATE_LIMIT} is too permissive for production (max 20).`);
    if (env.SESSION_IDLE_HOURS > 24)
      throw new Error(`SESSION_IDLE_HOURS=${env.SESSION_IDLE_HOURS} leaves an unattended session signed in for more than a day.`);
    if (env.SESSION_ABSOLUTE_DAYS > 30)
      throw new Error(`SESSION_ABSOLUTE_DAYS=${env.SESSION_ABSOLUTE_DAYS} is too long for production (max 30).`);
  }
  // An idle window longer than the absolute one can never fire, which would
  // look like a working setting that silently does nothing.
  if (env.SESSION_IDLE_HOURS > env.SESSION_ABSOLUTE_DAYS * 24)
    throw new Error('SESSION_IDLE_HOURS exceeds SESSION_ABSOLUTE_DAYS — the idle limit could never apply.');
  return env;
}

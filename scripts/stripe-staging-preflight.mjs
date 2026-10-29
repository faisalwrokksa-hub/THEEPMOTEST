/** Safe configuration-only verification. Never accesses Stripe or prints credentials. */
import { fileURLToPath } from 'node:url';
import { isIP } from 'node:net';

function httpsEndpoint(raw, expectedPath = '') {
  if (!raw) return false;
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' && !url.username && !url.password &&
      !url.search && !url.hash && url.hostname.includes('.') && url.hostname !== 'localhost' && !url.hostname.endsWith('.localhost') &&
      !url.hostname.endsWith('.local') && !url.hostname.endsWith('.internal') &&
      !isIP(url.hostname.replace(/^\[|\]$/g, '')) &&
      (expectedPath ? url.pathname === expectedPath && url.origin + url.pathname === raw : url.origin === raw);
  } catch { return false; }
}

export function checkStripeStagingConfig(env) {
  const checks = [
    ['Stripe adapter explicitly enabled', env.STRIPE_ENABLED === 'true'],
    ['Stripe test key configured (not live)', /^sk_test_[A-Za-z0-9]{12,}$/.test(env.STRIPE_SECRET_KEY || '')],
    ['Stripe webhook signing secret present', /^whsec_[A-Za-z0-9]{16,}$/.test(env.STRIPE_WEBHOOK_SECRET || '')],
    ['Staging deployment identified', env.DEPLOYMENT_ENV === 'staging'],
    ['Public HTTPS web origin', httpsEndpoint(env.WEB_ORIGIN)],
    ['Public HTTPS Stripe webhook URL', httpsEndpoint(env.STRIPE_WEBHOOK_PUBLIC_URL, '/api/v1/billing/stripe-webhook')],
    ['Application PostgreSQL URL present', (() => { try { const u = new URL(env.DATABASE_URL); return ['postgres:', 'postgresql:'].includes(u.protocol) && !!u.hostname && !!u.username && !!u.password && !!u.pathname.slice(1) && !/replace|placeholder|example|changeme|dummy|your_/i.test(decodeURIComponent(u.password)); } catch { return false; } })()],
    ['Reference webhook disabled', env.BILLING_REFERENCE_WEBHOOK_ENABLED !== 'true'],
    ['Production-build staging explicitly permitted', env.NODE_ENV !== 'production' || env.STRIPE_ALLOW_TEST_MODE_IN_PRODUCTION === 'true'],
  ];
  return checks.map(([name, passed]) => ({ name, passed }));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const checks = checkStripeStagingConfig(process.env);
  for (const { name, passed } of checks) console.log(`${passed ? 'PASS' : 'BLOCKED'} ${name}`);
  console.log(`${checks.filter(c=>c.passed).length}/${checks.length} Stripe staging configuration checks ready`);
  console.log('NOTE: This does not call Stripe, validate the signing secret, or test database connectivity.');
  if (checks.some(c=>!c.passed)) process.exitCode = 1;
}

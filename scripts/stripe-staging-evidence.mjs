/**
 * Read-only Stripe Checkout renewal acceptance evidence for a REAL staging deployment.
 * No checkout creation, webhook spoofing, DB mutation, or payment is performed here.
 * The operator first creates a test Checkout session, takes a baseline, completes
 * the payment with a Stripe test card, waits for webhook delivery, and verifies.
 *
 * Secrets are read only from environment variables and never stored in evidence.
 */
import { isIP } from 'node:net';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SESSION = /^cs_test_[A-Za-z0-9]+$/;
const PAYMENT = /^pi_[A-Za-z0-9]+$/;
const allowedApiPaths = Object.freeze({
  invoices: '/api/v1/subscription/billing/invoices',
  payments: '/api/v1/subscription/billing/payments',
  current: '/api/v1/subscription/current',
});

function ensure(condition, reason) { if (!condition) throw new Error(reason); }
function absoluteTime(value, description) {
  const stamp = new Date(value).getTime();
  ensure(Number.isFinite(stamp), `Invalid ${description}`);
  return stamp;
}

export function validateEvidenceConfig(env) {
  ensure(env.DEPLOYMENT_ENV === 'staging', 'DEPLOYMENT_ENV must be staging');
  ensure(/^sk_test_[A-Za-z0-9]{12,}$/.test(env.STRIPE_SECRET_KEY || ''), 'A Stripe TEST secret key is required');
  ensure(SESSION.test(env.STRIPE_E2E_SESSION_ID || ''), 'A Stripe test Checkout session ID is required');
  ensure(UUID.test(env.STRIPE_E2E_INVOICE_ID || ''), 'Valid invoice ID required');
  ensure(typeof env.STRIPE_E2E_TENANT_A_COOKIE === 'string' && env.STRIPE_E2E_TENANT_A_COOKIE.length >= 16 &&
    !/[\r\n;\s]/.test(env.STRIPE_E2E_TENANT_A_COOKIE), 'Tenant A session token required');
  ensure(typeof env.STRIPE_E2E_TENANT_B_COOKIE === 'string' && env.STRIPE_E2E_TENANT_B_COOKIE.length >= 16 &&
    !/[\r\n;\s]/.test(env.STRIPE_E2E_TENANT_B_COOKIE) &&
    env.STRIPE_E2E_TENANT_A_COOKIE !== env.STRIPE_E2E_TENANT_B_COOKIE,
    'Distinct Tenant B session token required for isolation testing');
  let url;
  try { url = new URL(env.STRIPE_E2E_API_ORIGIN || ''); } catch { throw new Error('Invalid staging API origin'); }
  ensure(url.protocol === 'https:' && url.origin === env.STRIPE_E2E_API_ORIGIN &&
    !url.username && !url.password && !isIP(url.hostname) &&
    url.hostname !== 'localhost' && !url.hostname.endsWith('.local') &&
    !url.hostname.endsWith('.internal'), 'Staging API origin must be public HTTPS');
  return {
    apiOrigin: url.origin,
    invoiceId: env.STRIPE_E2E_INVOICE_ID,
    sessionId: env.STRIPE_E2E_SESSION_ID,
    stripeSecret: env.STRIPE_SECRET_KEY,
    tenantACookie: env.STRIPE_E2E_TENANT_A_COOKIE,
    tenantBCookie: env.STRIPE_E2E_TENANT_B_COOKIE,
  };
}

async function readJson(url, headers, fetchImpl) {
  const response = await fetchImpl(url, { headers, method: 'GET', redirect: 'error', signal: AbortSignal.timeout(15000) });
  ensure(response && typeof response.status === 'number', 'Invalid HTTP response');
  ensure(response.status === 200, `Unexpected HTTP ${response.status} at ${new URL(url).pathname}`);
  const body = await response.json();
  return body;
}

function findInvoice(invoices, invoiceId) {
  ensure(Array.isArray(invoices), 'Invoice API must return an array');
  return invoices.find(row => row?.id === invoiceId);
}
function findPayments(payments, invoiceId) {
  ensure(Array.isArray(payments), 'Payment API must return an array');
  return payments.filter(row => row?.invoiceId === invoiceId);
}
function assertSessionIdentity(session, invoice) {
  ensure(session?.object === 'checkout.session' && session.id &&
    session.id.startsWith('cs_test_') && session.livemode === false,
    'Checkout session must be in Stripe test mode');
  ensure(session.mode === 'payment' && session.client_reference_id === invoice.id &&
    session.metadata?.invoiceId === invoice.id, 'Stripe Checkout session references the wrong invoice');
  ensure(UUID.test(invoice.tenantId || '') && session.metadata?.tenantId === invoice.tenantId,
    'Stripe Checkout tenant metadata does not match the authenticated invoice tenant');
  ensure(Number.isSafeInteger(session.amount_total) && session.amount_total === invoice.amountMinor &&
    session.currency === invoice.currency?.toLowerCase(), 'Stripe amount or currency does not match invoice');
}

/** Inspect a single test invoice, Stripe session, and both tenant views. */
export async function collectStripeEvidence(env, fetchImpl = fetch) {
  const config = validateEvidenceConfig(env);
  const withCookie = value => ({ cookie: `pmo_session=${value}`, accept: 'application/json' });
  const paths = allowedApiPaths;
  const [invoicesA, paymentsA, current, invoicesB, paymentsB, stripeSession] = await Promise.all([
    readJson(config.apiOrigin + paths.invoices, withCookie(config.tenantACookie), fetchImpl),
    readJson(config.apiOrigin + paths.payments, withCookie(config.tenantACookie), fetchImpl),
    readJson(config.apiOrigin + paths.current, withCookie(config.tenantACookie), fetchImpl),
    readJson(config.apiOrigin + paths.invoices, withCookie(config.tenantBCookie), fetchImpl),
    readJson(config.apiOrigin + paths.payments, withCookie(config.tenantBCookie), fetchImpl),
    readJson(`https://api.stripe.com/v1/checkout/sessions/${config.sessionId}`,
      { authorization: `Bearer ${config.stripeSecret}`, accept: 'application/json' }, fetchImpl),
  ]);
  const invoice = findInvoice(invoicesA, config.invoiceId);
  ensure(invoice, 'Tenant A invoice not visible; create or select an invoice from the latest 100 records');
  ensure(!findInvoice(invoicesB, config.invoiceId) && findPayments(paymentsB, config.invoiceId).length === 0,
    'TENANT ISOLATION FAILURE: Tenant B can see Tenant A financial records');
  ensure(current && UUID.test(current.id), 'Tenant A current subscription is unavailable');
  ensure(invoice.subscriptionId === current.id, 'Invoice does not belong to current Tenant A subscription');
  ensure(stripeSession.id === config.sessionId, 'Stripe returned the wrong Checkout session');
  assertSessionIdentity(stripeSession, invoice);
  const payments = findPayments(paymentsA, config.invoiceId);
  return {
    capturedAt: new Date().toISOString(),
    environment: 'staging', stripeMode: 'test',
    sessionId: stripeSession.id, invoiceId: invoice.id, subscriptionId: current.id,
    invoiceStatus: invoice.status, invoiceAmountMinor: invoice.amountMinor,
    invoiceCurrency: invoice.currency, invoicePeriodStartsAt: invoice.periodStartsAt,
    invoicePeriodEndsAt: invoice.periodEndsAt,
    subscriptionStatus: current.status,
    subscriptionPeriodStartsAt: current.periodStartsAt,
    subscriptionPeriodEndsAt: current.periodEndsAt,
    paymentCount: payments.length,
    paymentProvider: payments[0]?.provider ?? null,
    paymentProviderId: payments[0]?.providerPaymentId ?? null,
    paymentAmountMinor: payments[0]?.amountMinor ?? null,
    paymentCurrency: payments[0]?.currency ?? null,
    stripePaymentStatus: stripeSession.payment_status,
    stripeSessionStatus: stripeSession.status,
    stripePaymentIntent: stripeSession.payment_intent ?? null,
    isolationChecked: true,
  };
}

/** The baseline must be captured BEFORE completing the test payment. */
export function assertStripeBaseline(snapshot) {
  ensure(snapshot.environment === 'staging' && snapshot.stripeMode === 'test' && snapshot.isolationChecked,
    'Baseline did not pass staging and tenant-isolation checks');
  ensure(snapshot.invoiceStatus === 'open' && snapshot.paymentCount === 0,
    'Baseline invoice must be unpaid with no payment ledger entry');
  ensure(snapshot.stripePaymentStatus !== 'paid' && snapshot.stripeSessionStatus === 'open',
    'Capture baseline before completing Stripe Checkout');
  ensure(absoluteTime(snapshot.subscriptionPeriodEndsAt, 'baseline subscription end') ===
    absoluteTime(snapshot.invoicePeriodStartsAt, 'renewal invoice start'), 'Invoice is not for the next subscription period');
  return true;
}

/** Verify one Stripe-confirmed payment caused exactly one recorded renewal. */
export function assertStripeVerified(before, after) {
  assertStripeBaseline(before);
  ensure(after.environment === 'staging' && after.stripeMode === 'test' && after.isolationChecked,
    'Verification did not pass staging and tenant-isolation checks');
  ensure(before.invoiceId === after.invoiceId && before.sessionId === after.sessionId &&
    before.subscriptionId === after.subscriptionId, 'Baseline and verification refer to different records');
  ensure(before.invoiceAmountMinor === after.invoiceAmountMinor &&
    before.invoiceCurrency === after.invoiceCurrency &&
    absoluteTime(before.invoicePeriodStartsAt, 'invoice start') === absoluteTime(after.invoicePeriodStartsAt, 'invoice start') &&
    absoluteTime(before.invoicePeriodEndsAt, 'invoice end') === absoluteTime(after.invoicePeriodEndsAt, 'invoice end'),
    'Renewal invoice changed during verification');
  ensure(after.stripePaymentStatus === 'paid' && after.stripeSessionStatus === 'complete' &&
    PAYMENT.test(after.stripePaymentIntent || ''), 'Stripe Checkout is not confirmed paid');
  ensure(after.invoiceStatus === 'paid' && after.paymentCount === 1 &&
    after.paymentProvider === 'stripe' && after.paymentProviderId === after.stripePaymentIntent &&
    after.paymentAmountMinor === after.invoiceAmountMinor && after.paymentCurrency === after.invoiceCurrency,
    'The EPMO ledger does not show exactly one matching Stripe settlement');
  ensure(after.subscriptionStatus === 'active' &&
    absoluteTime(after.subscriptionPeriodStartsAt, 'subscription start') ===
    absoluteTime(after.invoicePeriodStartsAt, 'invoice start') &&
    absoluteTime(after.subscriptionPeriodEndsAt, 'subscription end') ===
    absoluteTime(after.invoicePeriodEndsAt, 'invoice end'),
    'The EPMO subscription does not match the paid renewal period');
  ensure(absoluteTime(after.subscriptionPeriodEndsAt, 'renewed subscription end') >
    absoluteTime(before.subscriptionPeriodEndsAt, 'baseline subscription end'),
    'Subscription was not extended by the payment');
  return true;
}

/** Compare a settled evidence record with a later, manually replayed webhook check. */
export function assertStripeReplayStable(verified, afterReplay) {
  ensure(verified.invoiceStatus === 'paid' && verified.paymentCount === 1 &&
    verified.stripePaymentStatus === 'paid' && verified.isolationChecked, 'The first verification is not settled');
  ensure(afterReplay.isolationChecked && afterReplay.stripePaymentStatus === 'paid' &&
    afterReplay.invoiceStatus === 'paid' && afterReplay.paymentCount === 1 &&
    verified.invoiceId === afterReplay.invoiceId && verified.sessionId === afterReplay.sessionId &&
    verified.subscriptionId === afterReplay.subscriptionId &&
    verified.paymentProviderId === afterReplay.paymentProviderId &&
    verified.paymentAmountMinor === afterReplay.paymentAmountMinor &&
    verified.paymentCurrency === afterReplay.paymentCurrency &&
    absoluteTime(verified.subscriptionPeriodStartsAt, 'verified subscription start') ===
      absoluteTime(afterReplay.subscriptionPeriodStartsAt, 'replay subscription start') &&
    absoluteTime(verified.subscriptionPeriodEndsAt, 'verified subscription end') ===
      absoluteTime(afterReplay.subscriptionPeriodEndsAt, 'replay subscription end'),
    'Ledger or subscription changed after replay; investigate duplicate settlement');
  return true;
}

async function main() {
  const phase = process.argv[2];
  const filePath = resolve(process.argv[3] || './stripe-staging-baseline.json');
  ensure(['baseline', 'verify', 'replay-check'].includes(phase), 'Usage: node scripts/stripe-staging-evidence.mjs baseline|verify|replay-check [baseline.json]');
  const evidence = await collectStripeEvidence(process.env);
  if (phase === 'baseline') {
    assertStripeBaseline(evidence);
    // The evidence contains no session cookies, Stripe keys, or personal details.
    await writeFile(filePath, `${JSON.stringify(evidence, null, 2)}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    console.log('PASS Stripe test-mode baseline, invoice, and second-tenant isolation; evidence saved.');
  } else if (phase === 'verify') {
    const before = JSON.parse(await readFile(filePath, 'utf8'));
    assertStripeVerified(before, evidence);
    await writeFile(`${filePath}.verified.json`, `${JSON.stringify(evidence, null, 2)}\n`,
      { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    console.log('PASS Stripe test-mode Checkout settlement: exactly one ledger payment, correct renewal period, and tenant isolation.');
    console.log('Verified evidence saved for a future replay check.');
  } else {
    const verified = JSON.parse(await readFile(`${filePath}.verified.json`, 'utf8'));
    assertStripeReplayStable(verified, evidence);
    console.log('PASS Duplicate-webhook replay verification: no extra ledger payment or subscription extension.');
  }
  console.log('This checks API and Stripe read-only evidence; database RLS and webhook replay require separate tests.');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch(error => {
    // Do not print HTTP response bodies or environment variable values.
    console.error('BLOCKED', error instanceof Error ? error.message : 'Unknown verification failure');
    process.exitCode = 1;
  });
}

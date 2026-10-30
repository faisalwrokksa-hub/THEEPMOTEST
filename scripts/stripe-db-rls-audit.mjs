/**
 * Read-only staging PostgreSQL RLS acceptance gate for Stripe financial tables.
 * Never creates records, grants privileges, connects with admin credentials, or
 * prints connection strings. Run with a pmo_app DATABASE_URL and two seeded tenants.
 */
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

export const FINANCIAL_TABLES = Object.freeze([
  'tenant_subscriptions',
  'subscription_events',
  'billing_invoices',
  'billing_payments',
  'billing_webhook_receipts',
  'billing_stripe_checkout_sessions',
  'billing_payment_exceptions',
]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function assert(condition, message) { if (!condition) throw new Error(message); }

export function validateStripeDbAuditConfig(env) {
  assert(env.DEPLOYMENT_ENV === 'staging', 'DEPLOYMENT_ENV must equal staging');
  assert(typeof env.DATABASE_URL === 'string' && env.DATABASE_URL.length > 0,
    'DATABASE_URL for the restricted staging application role is required');
  let url;
  try { url = new URL(env.DATABASE_URL); }
  catch { throw new Error('DATABASE_URL is not a valid PostgreSQL URL'); }
  assert(['postgres:', 'postgresql:'].includes(url.protocol) && url.hostname && url.pathname.length > 1,
    'DATABASE_URL must identify a PostgreSQL database');
  assert(url.username === 'pmo_app', 'DATABASE_URL must use the restricted pmo_app role');
  assert(UUID.test(env.STRIPE_DB_TENANT_A_ID || '') && UUID.test(env.STRIPE_DB_TENANT_B_ID || '') &&
    env.STRIPE_DB_TENANT_A_ID !== env.STRIPE_DB_TENANT_B_ID,
  'Two distinct staging tenant UUIDs are required');
  return { databaseUrl: env.DATABASE_URL, tenantA: env.STRIPE_DB_TENANT_A_ID,
    tenantB: env.STRIPE_DB_TENANT_B_ID };
}

/** Metadata alone does not prove isolation; perform tenant-bound row reads too. */
export function inspectFinancialSchema(catalogRows, expected = FINANCIAL_TABLES) {
  assert(Array.isArray(catalogRows), 'Invalid database RLS catalog response');
  const byName = new Map(catalogRows.map(row => [row.name, row]));
  const failures = [];
  for (const name of expected) {
    const row = byName.get(name);
    if (!row) { failures.push(`${name}: migration missing`); continue; }
    if (row.rlsEnabled !== true || row.rlsForced !== true)
      failures.push(`${name}: RLS must be enabled AND forced`);
    if (!Number.isInteger(Number(row.policyCount)) || Number(row.policyCount) < 1)
      failures.push(`${name}: missing tenant isolation policy`);
  }
  return failures;
}

export function verifyVisibleRows(rows, requestedTenant, tableName) {
  assert(Array.isArray(rows), `Unexpected ${tableName} response`);
  for (const row of rows) {
    if (!row || row.tenantId !== requestedTenant)
      throw new Error(`TENANT ISOLATION FAILURE in ${tableName}`);
  }
  return rows.reduce((total, row) => {
    const count = Number(row.rowCount);
    assert(Number.isSafeInteger(count) && count >= 0, `Invalid ${tableName} row count`);
    return total + count;
  }, 0);
}

/**
 * Make the database dependency injectable for deterministic unit tests. Each
 * transaction is READ ONLY. Query all tenant-scoped financial tables without
 * tenant WHERE predicates so PostgreSQL RLS is the actual enforcement layer.
 */
export async function auditStripeDbRls(db, tenantA, tenantB) {
  const identity = await db`SELECT current_user AS "dbRole",
    (SELECT rolsuper FROM pg_roles WHERE rolname=current_user) AS "isSuperuser",
    (SELECT rolbypassrls FROM pg_roles WHERE rolname=current_user) AS "bypassRls"`;
  assert(identity.length === 1 && identity[0].dbRole === 'pmo_app' &&
    identity[0].isSuperuser === false && identity[0].bypassRls === false,
    'Unsafe database role: requires pmo_app without SUPERUSER or BYPASSRLS');

  const catalog = await db`SELECT c.relname AS name, c.relrowsecurity AS "rlsEnabled",
      c.relforcerowsecurity AS "rlsForced",
      (SELECT COUNT(*)::int FROM pg_policies p WHERE p.schemaname='public' AND
        p.tablename=c.relname) AS "policyCount"
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind IN ('r','p')`;
  const failures = inspectFinancialSchema(catalog);
  assert(failures.length === 0, `Unsafe financial table policies: ${failures.join('; ')}`);

  const sampled = {};
  // A single read-only transaction per tenant ensures SET LOCAL never persists
  // beyond the scope of the audit, including on connection reuse.
  for (const requestedTenant of [null, tenantA, tenantB]) {
    const counts = await db.begin(async tx => {
      await tx`SET TRANSACTION READ ONLY`;
      await tx`SELECT set_config('app.tenant_id', ${requestedTenant || ''}, true)`;
      const result = {};
      for (const table of FINANCIAL_TABLES) {
        // Table names are hard-coded, never user input. Database aggregates
        // ALL visible rows; a LIMIT might conceal leaked records in a large table.
        // The transaction is read-only, with transaction-local tenant context.
        const rows = await tx.unsafe(`SELECT tenant_id AS "tenantId", COUNT(*)::int AS "rowCount" FROM public.${table} GROUP BY tenant_id`);
        result[table] = verifyVisibleRows(rows, requestedTenant, table);
      }
      return result;
    });
    sampled[requestedTenant || 'unset'] = counts;
  }
  const empty = sampled.unset;
  assert(FINANCIAL_TABLES.every(table => empty[table] === 0),
    'TENANT ISOLATION FAILURE: financial records visible without a tenant');
  // Both staging tenants must actually have subscriptions and at least one
  // must have an invoice, so this cannot pass trivially against empty tables.
  assert(sampled[tenantA].tenant_subscriptions > 0 && sampled[tenantB].tenant_subscriptions > 0,
    'Inconclusive: stage a subscription for BOTH independent tenants');
  assert(sampled[tenantA].billing_invoices > 0,
    'Inconclusive: stage at least one invoice for Tenant A');
  return { passed: true, tables: FINANCIAL_TABLES.length,
    role: 'pmo_app', tenantARowCounts: sampled[tenantA], tenantBRowCounts: sampled[tenantB],
    unsetTenantRows: 0,
    limits: 'Read-only full-table tenant aggregation; run dedicated adversarial PostgreSQL mutation tests before production' };
}

/**
 * Postgres.js may expose its callable client as the CommonJS export or as the
 * default of an ESM namespace after a major dependency upgrade. Reject any
 * unexpected module shape before opening a connection.
 */
export function resolvePostgresClientFactory(moduleExports) {
  const factory = typeof moduleExports === 'function'
    ? moduleExports : moduleExports?.default;
  assert(typeof factory === 'function', 'PostgreSQL client module has no callable factory');
  return factory;
}

/** Sanitized CI diagnostics: never log SQL, connection URLs, or secrets. */
export function safeStripeDbFailure(error, phase) {
  const codes = new Set(['28P01','42501','42P01','42703','25006','22P02','23503',
    'ECONNREFUSED','ETIMEDOUT','ERR_REQUIRE_ESM','ERR_MODULE_NOT_FOUND',
    'MODULE_NOT_FOUND','ERR_PACKAGE_PATH_NOT_EXPORTED']);
  const code = typeof error?.code === 'string' && codes.has(error.code)
    ? error.code : 'UNCLASSIFIED';
  const message = typeof error?.message === 'string' ? error.message : '';
  const reason = /TENANT ISOLATION FAILURE/.test(message) ? 'tenant-isolation violation'
    : /Inconclusive/.test(message) ? 'missing seeded financial fixtures'
    : /Unsafe/.test(message) ? 'unsafe role or RLS policy'
    : /PostgreSQL client module has no callable factory/.test(message) ? 'incompatible database driver export' 
    : /DATABASE_URL|DEPLOYMENT_ENV|tenant UUIDs/.test(message) ? 'invalid audit configuration'
    : 'database or driver failure';
  return `BLOCKED Stripe database RLS audit [${phase}; ${code}]: ${reason}`;
}

async function main() {
  let phase = 'configuration';
  try {
  const config = validateStripeDbAuditConfig(process.env);
  // Resolve postgres from the actual @pmo/db workspace dependency rather than
  // introducing a duplicate root dependency.
  phase = 'driver';
  const requireDb = createRequire(new URL('../packages/db/package.json', import.meta.url));
  const postgres = resolvePostgresClientFactory(requireDb('postgres'));
  const db = postgres(config.databaseUrl, { max: 1, connect_timeout: 10 });
  phase = 'read-only RLS acceptance';
  try {
    const result = await auditStripeDbRls(db, config.tenantA, config.tenantB);
    console.log(`PASS Stripe billing PostgreSQL RLS: ${result.tables} tables, two tenants, restricted role, no-tenant denial`);
    console.log('Counts per tenant:', JSON.stringify({ A: result.tenantARowCounts, B: result.tenantBRowCounts }));
    console.log('LIMIT: This is sampled live staging evidence, not proof of full production readiness.');
  } finally { await db.end(); }
  } catch (error) {
    console.error(safeStripeDbFailure(error, phase));
    process.exitCode = 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}

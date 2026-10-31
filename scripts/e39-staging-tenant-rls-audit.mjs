/**
 * E39: read-only staging PostgreSQL acceptance across EVERY public tenant_id
 * table, not only the financial tables. This does not seed or mutate data.
 * Requires two populated project tenants and the restricted pmo_app principal.
 * Complements (does not replace) verify:rls strict policy-expression checks.
 */
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const OPT_IN = 'YES_READ_ONLY_STAGING_RLS_AUDIT';
const fail = (message) => { throw new Error(message); };

export function validateTenantAuditConfig(env) {
  if (env.DEPLOYMENT_ENV !== 'staging' || env.NODE_ENV === 'production' ||
      env.EPMO_STAGING_RLS_READONLY !== OPT_IN)
    fail('Explicit nonproduction staging read-only audit authorization is required');
  let url;
  try { url = new URL(env.DATABASE_URL); } catch { fail('Invalid restricted PostgreSQL configuration'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.username !== 'pmo_app' ||
      !url.hostname || url.pathname.length < 2)
    fail('Audit requires the restricted pmo_app PostgreSQL connection');
  const a = env.EPMO_RLS_TENANT_A_ID, b = env.EPMO_RLS_TENANT_B_ID;
  if (!UUID.test(a || '') || !UUID.test(b || '') || a.toLowerCase() === b.toLowerCase())
    fail('Two different staging tenant UUIDs are required');
  return { databaseUrl: env.DATABASE_URL, tenantA: a, tenantB: b };
}

export function assertTenantCatalog(rows) {
  if (!Array.isArray(rows) || !rows.some(row => row.name === 'projects'))
    fail('Inconclusive: tenant-scoped projects table is missing');
  const names = new Set();
  for (const row of rows) {
    if (typeof row.name !== 'string' || !row.name || names.has(row.name) ||
        row.rlsEnabled !== true || row.rlsForced !== true ||
        !Number.isSafeInteger(Number(row.policyCount)) || Number(row.policyCount) < 1)
      fail('Missing, duplicate, or unsafe tenant RLS catalog entry');
    names.add(row.name);
  }
  return [...names].sort();
}

/**
 * E40: row-visibility probes alone are inconclusive on tables with no foreign
 * fixtures. Reject permissive policies that could bypass tenant isolation,
 * even when the current two-tenant sample happens not to expose a leak.
 * Keep this in sync with packages/db/src/tenant-rls-catalog-policy.ts.
 */
const legacyBillingNames = new Set([
  'tenant_subscriptions_isolation', 'subscription_events_isolation',
  'tenant_profiles_isolation', 'tenant_invitations_isolation',
  'billing_tenant_isolation', 'billing_stripe_tenant_isolation',
  'billing_payment_exception_tenant_isolation',
]);
const normalizePolicy = expression =>
  typeof expression === 'string' ? expression.replace(/[\s()]/g, '').toLowerCase() : '';
function validTenantPredicate(expression) {
  const value = normalizePolicy(expression);
  return value === 'tenant_id=app_current_tenant' ||
    value === 'tenant_id=public.app_current_tenant';
}
function validLegacyBillingPredicate(expression) {
  const value = normalizePolicy(expression);
  const prefix = "tenant_id=nullifcurrent_setting'app.tenant_id'";
  for (const settingCast of ['', '::text']) {
    for (const emptyCast of ['', '::text']) {
      if (value === `${prefix}${settingCast},true,''${emptyCast}::uuid`) return true;
    }
  }
  return false;
}
export function assertTenantPolicyRows(rows, tables) {
  if (!Array.isArray(rows) || !Array.isArray(tables) || !tables.length)
    fail('Missing tenant RLS policy evidence');
  const known = new Set(tables);
  const policies = new Map(tables.map(table => [table, []]));
  for (const row of rows) {
    if (!row || !known.has(row.tableName) || typeof row.policyName !== 'string' ||
        !row.policyName || !['PERMISSIVE', 'RESTRICTIVE'].includes(row.permissive))
      fail('Unsafe tenant RLS policy catalog');
    policies.get(row.tableName).push(row);
  }
  for (const [table, entries] of policies) {
    const permissive = entries.filter(row => row.permissive === 'PERMISSIVE');
    if (permissive.filter(row => row.policyName === 'tenant_isolation').length !== 1)
      fail('Missing or duplicate tenant isolation policy');
    for (const row of permissive) {
      const valid = row.policyName === 'tenant_isolation'
        ? validTenantPredicate
        : legacyBillingNames.has(row.policyName) ? validLegacyBillingPredicate : () => false;
      if (row.command !== 'ALL' || !valid(row.usingExpression) ||
          !valid(row.checkExpression))
        fail('Unsafe permissive tenant RLS policy');
    }
  }
  return tables.length;
}

export function quotePgIdentifier(name) {
  if (typeof name !== 'string' || !name || name.includes('\0')) fail('Invalid PostgreSQL identifier');
  return '"' + name.replaceAll('"', '""') + '"';
}

export function verifyTenantCounts(rows, tenant, table) {
  if (!Array.isArray(rows)) fail('Malformed tenant aggregation response');
  let total = 0;
  for (const row of rows) {
    if (!row || row.tenantId !== tenant)
      fail('TENANT ISOLATION FAILURE: visible foreign or unset-tenant row');
    const count = Number(row.rowCount);
    if (!Number.isSafeInteger(count) || count < 1 || !Number.isSafeInteger(total + count))
      fail('Invalid tenant aggregation count');
    total += count;
  }
  return total;
}

export async function auditAllTenantRls(db, tenantA, tenantB) {
  const identity = await db.unsafe('SELECT current_user AS "dbRole", (SELECT rolsuper FROM pg_roles WHERE rolname=current_user) AS "isSuperuser", (SELECT rolbypassrls FROM pg_roles WHERE rolname=current_user) AS "bypassRls"');
  if (identity.length !== 1 || identity[0].dbRole !== 'pmo_app' ||
      identity[0].isSuperuser !== false || identity[0].bypassRls !== false)
    fail('Unsafe database role: requires pmo_app without SUPERUSER or BYPASSRLS');
  const catalog = await db.unsafe(
    'SELECT c.relname AS name, c.relrowsecurity AS "rlsEnabled", c.relforcerowsecurity AS "rlsForced", ' +
    '(SELECT COUNT(*)::int FROM pg_policies p WHERE p.schemaname=n.nspname AND p.tablename=c.relname) AS "policyCount" ' +
    'FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace ' +
    "JOIN pg_attribute a ON a.attrelid=c.oid AND a.attname='tenant_id' AND NOT a.attisdropped " +
    "WHERE n.nspname='public' AND c.relkind IN ('r','p') ORDER BY c.relname"
  );
  const tables = assertTenantCatalog(catalog);
  const policyRows = await db.unsafe(
    'SELECT c.relname AS "tableName", p.policyname AS "policyName", ' +
    'p.permissive, p.cmd AS command, p.qual AS "usingExpression", ' +
    'p.with_check AS "checkExpression" FROM pg_class c ' +
    'JOIN pg_namespace n ON n.oid=c.relnamespace ' +
    "JOIN pg_attribute a ON a.attrelid=c.oid AND a.attname='tenant_id' AND NOT a.attisdropped " +
    'LEFT JOIN pg_policies p ON p.schemaname=n.nspname AND p.tablename=c.relname ' +
    "WHERE n.nspname='public' AND c.relkind IN ('r','p') ORDER BY c.relname, p.policyname"
  );
  assertTenantPolicyRows(policyRows, tables);
  const counts = {};
  for (const [label, tenant] of [['unset', null], ['A', tenantA], ['B', tenantB]]) {
    counts[label] = await db.begin(async tx => {
      await tx.unsafe('SET TRANSACTION READ ONLY');
      await tx.unsafe("SELECT set_config('statement_timeout', '10000', true)");
      await tx.unsafe("SELECT set_config('app.tenant_id', $1, true)", [tenant || '']);
      const visible = {};
      for (const table of tables) {
        const sql = 'SELECT tenant_id AS "tenantId", COUNT(*)::int AS "rowCount" FROM public.' +
          quotePgIdentifier(table) + ' GROUP BY tenant_id';
        visible[table] = verifyTenantCounts(await tx.unsafe(sql), tenant, table);
      }
      return visible;
    });
  }
  if (counts.A.projects < 1 || counts.B.projects < 1)
    fail('Inconclusive: both staging tenants must have visible project fixtures');
  if (tables.some(table => counts.unset[table] !== 0))
    fail('TENANT ISOLATION FAILURE: rows visible with no tenant');
  return { passed: true, tables: tables.length, tenantAProjects: counts.A.projects,
    tenantBProjects: counts.B.projects, unsetTenantRows: 0,
    limits: 'Read-only staging observation, not independent external release acceptance' };
}

export function safeTenantAuditFailure(error, phase) {
  const code = typeof error?.code === 'string' &&
    /^(28P01|42501|42P01|42703|25006|ECONNREFUSED|ETIMEDOUT)$/.test(error.code)
    ? error.code : 'UNCLASSIFIED';
  const message = typeof error?.message === 'string' ? error.message : '';
  const reason = message.includes('TENANT ISOLATION FAILURE') ? 'tenant isolation violation'
    : message.includes('Inconclusive') ? 'missing staging tenant fixtures'
    : message.includes('Unsafe') || message.includes('catalog') ? 'unsafe role or RLS catalog'
    : message.includes('configuration') || message.includes('authorization') || message.includes('UUIDs') ? 'invalid audit configuration'
    : 'database or driver failure';
  return 'BLOCKED E39 staging tenant RLS [' + phase + '; ' + code + ']: ' + reason;
}

async function main() {
  let phase = 'configuration';
  try {
    const config = validateTenantAuditConfig(process.env);
    phase = 'driver';
    const requireDb = createRequire(new URL('../packages/db/package.json', import.meta.url));
    const exports = requireDb('postgres');
    const postgres = typeof exports === 'function' ? exports : exports?.default;
    if (typeof postgres !== 'function') fail('Incompatible PostgreSQL driver');
    const db = postgres(config.databaseUrl, { max: 1, connect_timeout: 10 });
    phase = 'read-only staging isolation';
    try {
      const result = await auditAllTenantRls(db, config.tenantA, config.tenantB);
      console.log('PASS E39 staging tenant RLS: ' + result.tables +
        ' tenant-scoped tables; both project fixtures visible; no-tenant denial');
      console.log('LIMIT: External staging acceptance and strict policy verification are separate release gates.');
    } finally { await db.end(); }
  } catch (error) {
    console.error(safeTenantAuditFailure(error, phase));
    process.exitCode = 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();

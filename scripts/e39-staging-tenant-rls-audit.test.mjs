import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateTenantAuditConfig, assertTenantCatalog, quotePgIdentifier,
  verifyTenantCounts, auditAllTenantRls, safeTenantAuditFailure,
} from './e39-staging-tenant-rls-audit.mjs';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const env = {
  DEPLOYMENT_ENV: 'staging', NODE_ENV: 'test',
  EPMO_STAGING_RLS_READONLY: 'YES_READ_ONLY_STAGING_RLS_AUDIT',
  DATABASE_URL: 'postgresql://pmo_app:dummy@staging.example.test/pmo',
  EPMO_RLS_TENANT_A_ID: A, EPMO_RLS_TENANT_B_ID: B,
};
const catalog = [
  { name: 'projects', rlsEnabled: true, rlsForced: true, policyCount: 1 },
  { name: 'audit_events', rlsEnabled: true, rlsForced: true, policyCount: 1 },
];

test('requires explicit staging opt-in and rejects production mode', () => {
  assert.equal(validateTenantAuditConfig(env).tenantB, B);
  for (const patch of [
    { DEPLOYMENT_ENV: 'production' }, { NODE_ENV: 'production' },
    { EPMO_STAGING_RLS_READONLY: '' }, { EPMO_RLS_TENANT_B_ID: A },
    { DATABASE_URL: 'postgres://postgres:secret@staging.example.test/pmo' },
    { DATABASE_URL: 'not-a-url' },
  ]) assert.throws(() => validateTenantAuditConfig({ ...env, ...patch }));
});
test('requires all tenant tables to have enabled, forced RLS and a policy', () => {
  assert.deepEqual(assertTenantCatalog(catalog), ['audit_events', 'projects']);
  for (const bad of [
    catalog.slice(1), [{ ...catalog[0], rlsEnabled: false }, catalog[1]],
    [{ ...catalog[0], rlsForced: false }, catalog[1]],
    [{ ...catalog[0], policyCount: 0 }, catalog[1]],
    [...catalog, catalog[0]],
  ]) assert.throws(() => assertTenantCatalog(bad));
});
test('quotes catalog-supplied PostgreSQL identifiers without SQL injection', () => {
  assert.equal(quotePgIdentifier('a"b'), '"a""b"');
  assert.throws(() => quotePgIdentifier('a\0b'));
});
test('rejects cross-tenant, unset-context and invalid aggregate rows', () => {
  assert.equal(verifyTenantCounts([{ tenantId: A, rowCount: 3 }], A, 'projects'), 3);
  assert.equal(verifyTenantCounts([], null, 'projects'), 0);
  for (const rows of [
    [{ tenantId: B, rowCount: 1 }],
    [{ tenantId: A, rowCount: 1 }, { tenantId: B, rowCount: 1 }],
    [{ tenantId: A, rowCount: -1 }],
    [{ tenantId: A, rowCount: 'not-a-number' }],
  ]) assert.throws(() => verifyTenantCounts(rows, A, 'projects'));
  assert.throws(() => verifyTenantCounts([{ tenantId: A, rowCount: 1 }], null, 'projects'));
});

function fakeDb({ role = 'pmo_app', bypass = false, superuser = false, leak = false,
  emptyB = false, catalogRows = catalog, missingReadOnly = false } = {}) {
  const state = { transactions: 0, readOnly: 0, tenantSettings: [] };
  const db = {
    async unsafe(sql) {
      if (sql.includes('current_user')) return [{ dbRole: role, isSuperuser: superuser, bypassRls: bypass }];
      if (sql.includes('pg_attribute')) return catalogRows;
      throw Error('Unexpected catalog SQL');
    },
    async begin(callback) {
      state.transactions++;
      let tenant = null;
      let readOnly = false;
      const tx = {
        async unsafe(sql, args) {
          if (sql === 'SET TRANSACTION READ ONLY') {
            readOnly = true; state.readOnly++; return [];
          }
          if (sql.includes("set_config('statement_timeout'")) return [];
          if (sql.includes("set_config('app.tenant_id'")) {
            tenant = args[0] || null; state.tenantSettings.push(tenant); return [];
          }
          if (!readOnly && !missingReadOnly) throw Error('Read outside read-only transaction');
          if (!sql.includes('GROUP BY tenant_id') || !sql.includes('public."')) throw Error('Unsafe row query');
          if (leak && !tenant && sql.includes('"projects"')) return [{ tenantId: A, rowCount: 1 }];
          if (tenant === A && sql.includes('"projects"')) return [{ tenantId: A, rowCount: 2 }];
          if (tenant === B && !emptyB && sql.includes('"projects"')) return [{ tenantId: B, rowCount: 3 }];
          return [];
        },
      };
      return callback(tx);
    },
  };
  return { db, state };
}
test('executes real tenant-context queries in three separate read-only transactions', async () => {
  const { db, state } = fakeDb();
  const result = await auditAllTenantRls(db, A, B);
  assert.equal(result.passed, true);
  assert.equal(result.tables, 2);
  assert.equal(result.tenantAProjects, 2);
  assert.equal(result.tenantBProjects, 3);
  assert.deepEqual(state.tenantSettings, [null, A, B]);
  assert.equal(state.readOnly, 3);
  assert.equal(state.transactions, 3);
});
test('rejects unpopulated second tenant instead of passing empty-table evidence', async () => {
  await assert.rejects(auditAllTenantRls(fakeDb({ emptyB: true }).db, A, B), /Inconclusive/);
});
test('rejects no-tenant leakage', async () => {
  await assert.rejects(auditAllTenantRls(fakeDb({ leak: true }).db, A, B), /ISOLATION FAILURE/);
});
test('rejects superuser, BYPASSRLS and wrong database role', async () => {
  for (const options of [{ superuser: true }, { bypass: true }, { role: 'postgres' }])
    await assert.rejects(auditAllTenantRls(fakeDb(options).db, A, B), /Unsafe database role/);
});
test('does not echo connection URLs, SQL or arbitrary provider errors', () => {
  const err = Object.assign(new Error('postgres://pmo_app:secret@private.host/db'), { code: '42501' });
  const output = safeTenantAuditFailure(err, 'read-only staging isolation');
  assert.match(output, /42501/);
  assert.doesNotMatch(output, /secret|private.host|postgres:\/\//);
});

import './env';
import postgres from 'postgres';
import { assertRestrictedVerifierRole, tenantRowsVisibleAndIsolated } from './rls-verification-policy';
import { assertTenantRlsCatalog } from './tenant-rls-catalog-policy';

/**
 * Proves the tenant boundary is enforced by Postgres, not by application code.
 * Connects as the APP role and queries projects with no WHERE clause at all.
 */
const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');
const sql = postgres(url, { max: 1 });

const ok = (b: boolean) => (b ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m');

async function main() {
  // This is a security acceptance check, not a smoke test. A superuser or
  // BYPASSRLS connection can make a tenant query look successful without
  // exercising the application's actual row-level security boundary.
  const [role] = await sql`
    SELECT current_user AS name, r.rolsuper AS superuser, r.rolbypassrls AS bypassrls
    FROM pg_roles r WHERE r.rolname = current_user
  `;
  assertRestrictedVerifierRole(role as { name: string; superuser: boolean; bypassrls: boolean } | undefined);
  const [policy] = await sql`
    SELECT relrowsecurity AS enabled, relforcerowsecurity AS forced
    FROM pg_class WHERE oid = 'public.projects'::regclass
  `;
  if (!policy?.enabled || !policy?.forced) {
    throw new Error('RLS verification requires ENABLE and FORCE ROW LEVEL SECURITY on projects');
  }

  // Inspect EVERY tenant_id table, not just projects. An additional permissive
  // policy can OR around tenant_isolation even when RLS is enabled and forced.
  const catalog = await sql`
    SELECT c.relname AS table_name, c.relrowsecurity AS enabled,
           c.relforcerowsecurity AS forced, p.policyname AS policy_name,
           p.permissive, p.cmd AS command, p.qual AS using_expression,
           p.with_check AS check_expression
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'tenant_id'
      AND NOT a.attisdropped
    LEFT JOIN pg_policies p ON p.schemaname = n.nspname
      AND p.tablename = c.relname
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
    ORDER BY c.relname, p.policyname
  `;
  const checkedTables = assertTenantRlsCatalog(catalog as unknown as Parameters<typeof assertTenantRlsCatalog>[0]);
  console.log(`${ok(true)}  ${checkedTables} tenant-scoped tables have enforced RLS and no permissive bypass policies`);

  const tenants = await sql`select id, name from tenants order by name`;
  if (tenants.length < 2) throw new Error('Run `pnpm db:seed` first.');
  let allPassed = true;

  for (const t of tenants) {
    const rows = await sql.begin(async (tx) => {
      await tx`select set_config('app.tenant_id', ${t.id}, true)`;
      return tx`select name, tenant_id from projects`;   // deliberately no WHERE
    });
    const leaked = rows.filter((r: any) => r.tenant_id !== t.id);
    // Empty tenant results prove nothing: a broken policy that denies all
    // access would otherwise pass this isolation gate.
    const pass = tenantRowsVisibleAndIsolated(rows as unknown as Array<{ tenant_id: string }>, t.id);
    allPassed &&= pass;
    console.log(`${ok(pass)}  ${t.name}: sees ${rows.length} project(s), ${leaked.length} from other tenants (requires seeded visibility)`);
  }

  // With no tenant set, the policy must expose nothing.
  const none = await sql.begin(async (tx) => tx`select count(*)::int as n from projects`);
  const pass = none[0].n === 0;
  allPassed &&= pass;
  console.log(`${ok(pass)}  no tenant set: sees ${none[0].n} project(s) (must be 0)`);

  console.log(allPassed ? '\n\x1b[32mTenant isolation holds.\x1b[0m' : '\n\x1b[31mIsolation broken.\x1b[0m');
  if (!allPassed) process.exitCode = 1;
}

main().then(() => sql.end()).catch(async (e) => { console.error(e); await sql.end(); process.exit(1); });

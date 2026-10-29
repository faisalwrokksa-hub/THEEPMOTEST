import './env';
import postgres from 'postgres';

/**
 * Proves the tenant boundary is enforced by Postgres, not by application code.
 * Connects as the APP role and queries projects with no WHERE clause at all.
 */
const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');
const sql = postgres(url, { max: 1 });

const ok = (b: boolean) => (b ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m');

async function main() {
  const tenants = await sql`select id, name from tenants order by name`;
  if (tenants.length < 2) throw new Error('Run `pnpm db:seed` first.');
  let allPassed = true;

  for (const t of tenants) {
    const rows = await sql.begin(async (tx) => {
      await tx`select set_config('app.tenant_id', ${t.id}, true)`;
      return tx`select name, tenant_id from projects`;   // deliberately no WHERE
    });
    const leaked = rows.filter((r: any) => r.tenant_id !== t.id);
    const pass = leaked.length === 0;
    allPassed &&= pass;
    console.log(`${ok(pass)}  ${t.name}: sees ${rows.length} project(s), ${leaked.length} from other tenants`);
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

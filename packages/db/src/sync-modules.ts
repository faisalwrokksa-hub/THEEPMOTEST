import './env';
import postgres from 'postgres';
import { MODULE_CATALOGUE } from '@pmo/contracts';

/**
 * Projects the code-owned module catalogue into the database, and makes sure
 * every tenant has the core module switched on. Runs with ADMIN rights: the
 * application role is deliberately read-only on `modules`.
 *
 * With `--sql` it prints the statements instead of running them, so the same
 * catalogue can be applied on a server that has no Node toolchain:
 *
 *   pnpm --silent --filter @pmo/db modules:sql \
 *     | ssh box "cd /opt/<deployment-directory> && docker compose -f docker-compose.prod.yml \
 *                 --env-file .env.prod exec -T postgres psql -U \$PG_USER -d \$PG_DB"
 */
const EMIT_SQL = process.argv.includes('--sql');

/** Single-quote a value for SQL. NULL for null/undefined. */
const q = (v: string | number | boolean | null) =>
  v === null || v === undefined ? 'NULL'
  : typeof v === 'string' ? `'${v.replace(/'/g, "''")}'`
  : String(v);

const CORE_ON = `
INSERT INTO tenant_modules (tenant_id, module_id, enabled, enabled_at)
SELECT t.id, m.id, true, now() FROM tenants t CROSS JOIN modules m WHERE m.is_core
ON CONFLICT (tenant_id, module_id) DO UPDATE SET enabled = true;`;

function emit() {
  const out: string[] = ['BEGIN;'];
  for (const m of MODULE_CATALOGUE) {
    out.push(`
INSERT INTO modules (id, name, summary, version, status, is_core, depends_on, sort_order)
VALUES (${q(m.id)}, ${q(m.name)}, ${q(m.summary)}, ${q(m.version)}, ${q(m.status)}::module_status,
        ${q(m.isCore)}, ${q(JSON.stringify(m.dependsOn))}::jsonb, ${q(m.sortOrder)})
ON CONFLICT (id) DO UPDATE SET
  name = excluded.name, summary = excluded.summary, version = excluded.version,
  status = excluded.status, is_core = excluded.is_core,
  depends_on = excluded.depends_on, sort_order = excluded.sort_order;`);
  }
  out.push(CORE_ON, 'COMMIT;');
  console.log(out.join('\n'));
}

async function run() {
  const url = process.env.DATABASE_URL_ADMIN;
  if (!url) throw new Error('DATABASE_URL_ADMIN is required');
  const sql = postgres(url, { max: 1 });
  try {
    for (const m of MODULE_CATALOGUE) {
      await sql`
        INSERT INTO modules (id, name, summary, version, status, is_core, depends_on, sort_order)
        VALUES (${m.id}, ${m.name}, ${m.summary}, ${m.version}, ${m.status}::module_status,
                ${m.isCore}, ${JSON.stringify(m.dependsOn)}::jsonb, ${m.sortOrder})
        ON CONFLICT (id) DO UPDATE SET
          name = excluded.name, summary = excluded.summary, version = excluded.version,
          status = excluded.status, is_core = excluded.is_core,
          depends_on = excluded.depends_on, sort_order = excluded.sort_order`;
    }
    await sql.unsafe(CORE_ON);

    const [c] = await sql`SELECT count(*)::int AS n FROM modules`;
    const built = MODULE_CATALOGUE.filter((m) => m.status !== 'roadmap').length;
    console.log(`Catalogue synced: ${c.n} modules (${built} licensable, ${MODULE_CATALOGUE.length - built} on the roadmap).`);
  } finally {
    await sql.end();
  }
}

if (EMIT_SQL) emit();
else run().catch((e) => { console.error(e); process.exit(1); });

import './env';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';
import * as schema from './schema';

export type Db = ReturnType<typeof drizzle<typeof schema>>;

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set (copy .env.example to .env)');

const queryClient = postgres(url, { max: 10 });
export const db = drizzle(queryClient, { schema });
export { schema };

/**
 * Run work inside a transaction scoped to one tenant.
 *
 * set_config(..., true) makes the setting transaction-local, so it cannot leak
 * to the next request that borrows this pooled connection — the failure mode
 * that makes naive RLS + connection pooling dangerous.
 */
export async function withTenant<T>(
  tenantId: string,
  fn: (tx: Parameters<Parameters<Db['transaction']>[0]>[0]) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.tenant_id', ${tenantId}, true)`);
    return fn(tx);
  });
}

export async function closeDb() { await queryClient.end({ timeout: 5 }); }

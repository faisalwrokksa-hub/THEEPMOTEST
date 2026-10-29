/** Intentionally blocked: Drizzle migrator writes a different journal from
 * public.schema_migrations. Retained as a fail-closed compatibility entrypoint.
 */
throw new Error('Unsafe Drizzle migration entrypoint disabled. Run the root SQL-ledger command: npm run db:migrate');

// Prevent accidental creation of a second, incompatible migration ledger.
console.error('BLOCKED: Drizzle migrator uses a different migration journal from The EPMO deployment.');
console.error('Use the root project command: npm run db:migrate (requires admin PGHOST/PGUSER/PGDATABASE/PGPASSWORD).');
process.exitCode = 1;

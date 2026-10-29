import { config } from 'dotenv';
import { resolve } from 'node:path';
import { defineConfig } from 'drizzle-kit';

config({ path: resolve(__dirname, '../../.env') });

export default defineConfig({
  schema: './src/schema.ts',
  out: './migrations',
  dialect: 'postgresql',
  // Schema changes need DDL rights, so this uses the admin role, not the app role.
  dbCredentials: { url: process.env.DATABASE_URL_ADMIN! },});

import { config } from 'dotenv';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

/**
 * Finds the monorepo-root .env by walking up from the current working
 * directory. Deliberately avoids import.meta so this file compiles under both
 * ESM (tsx, Next) and CommonJS (the Nest build).
 */
function findRootEnv(from: string = process.cwd()): string | null {
  let dir = resolve(from);
  for (let i = 0; i < 8; i++) {
    if (existsSync(resolve(dir, 'pnpm-workspace.yaml'))) {
      const env = resolve(dir, '.env');
      return existsSync(env) ? env : null;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

const rootEnv = findRootEnv();
if (rootEnv) config({ path: rootEnv });
config(); // a package-local .env may still override

import type { NextConfig } from 'next';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
// typedRoutes is off: our nav hrefs come from a data array, not literals.
const config: NextConfig = {
  // Standalone output keeps the production image small and self-contained.
  output: 'standalone',
  /**
   * Pin the trace root to the monorepo root. Without it Next walks up to the
   * nearest lockfile-ish ancestor (~/Documents here) and nests the standalone
   * output under that absolute path, so server.js is not where any deploy
   * script — or our Dockerfile — expects it.
   */
  outputFileTracingRoot: join(here, '../..'),
  /**
   * Production builds write to a different folder from `next dev`.
   * Sharing `.next` meant a prod build could delete the chunks a running dev
   * server had open, which surfaced as "Cannot find module './644.js'".
   */
  distDir: process.env.NEXT_DIST_DIR ?? '.next',
  poweredByHeader: false,
  transpilePackages: ['@pmo/contracts'],
};
export default config;

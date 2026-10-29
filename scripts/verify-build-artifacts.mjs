#!/usr/bin/env node
/**
 * Phase 15B: inspect the actual build outputs shipped by API and Next's
 * standalone Docker images. This is intentionally dependency-free so the
 * release gate can run inside CI and Docker build stages.
 *
 * Usage: node scripts/verify-build-artifacts.mjs [--scope packages|api|all]
 * Optional EPMO_ARTIFACT_ROOT points to the monorepo root for isolated tests.
 */
import { existsSync, statSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = resolve(process.env.EPMO_ARTIFACT_ROOT ?? fileURLToPath(new URL('../', import.meta.url)));
const scopes = new Set(['packages', 'api', 'all']);

export function checkBuildArtifacts(projectRoot, scope = 'all') {
  if (!scopes.has(scope)) throw new Error('Scope must be packages, api, or all');
  const checks = [];
  function check(label, relativePath, kind = 'file') {
    const target = join(projectRoot, relativePath);
    let ok = false;
    if (existsSync(target)) {
      const stat = statSync(target);
      ok = kind === 'directory' ? stat.isDirectory() && readdirSync(target).length > 0
        : stat.isFile() && stat.size > 0;
    }
    checks.push({ label, relativePath, ok });
  }
  check('contracts JS', 'packages/contracts/dist/index.js');
  check('contracts types', 'packages/contracts/dist/index.d.ts');
  check('database JS', 'packages/db/dist/index.js');
  check('database types', 'packages/db/dist/index.d.ts');
  if (scope !== 'packages') {
    check('NestJS API entrypoint', 'apps/api/dist/main.js');
  }
  if (scope === 'all') {
    check('Next.js production build ID', 'apps/web/.next-prod/BUILD_ID');
    check('Next.js standalone entrypoint', 'apps/web/.next-prod/standalone/apps/web/server.js');
    check('Next.js static assets', 'apps/web/.next-prod/static', 'directory');
    // A default .next directory may exist from development; it is NOT the
    // container artifact. Only .next-prod is acceptable for production.
  }
  return { passed: checks.every(c => c.ok), checks };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== '--scope' || !scopes.has(args[1])) {
    console.error('Usage: node scripts/verify-build-artifacts.mjs --scope packages|api|all');
    process.exitCode = 2;
  } else {
    const result = checkBuildArtifacts(root, args[1]);
    for (const { label, relativePath, ok } of result.checks) {
      console.log(`${ok ? 'PASS' : 'BLOCKED'} ${label}: ${relativePath}`);
    }
    console.log(`Build artifact gate: ${result.checks.filter(c => c.ok).length}/${result.checks.length} checks passed`);
    if (!result.passed) process.exitCode = 1;
  }
}

/** Dependency-free release gate. Runs on Node 22 before pnpm install. */
import { spawnSync } from 'node:child_process';
const checks = [
  ['dictionary', ['scripts/dict.mjs']],
  ['translation shadowing', ['scripts/shadow.mjs']],
  ['bilingual branding', ['scripts/verify-bilingual-brand.mjs']],
  ['production configuration', ['scripts/verify-production-config.mjs']],
  ['write-origin security', ['--experimental-strip-types', 'scripts/verify-write-origin.mjs']],
  ['web boundary security', ['--experimental-strip-types', 'scripts/verify-web-boundary.mjs']],
  ['tenant header authentication', ['scripts/verify-tenant-header-auth.mjs']],
  ['legacy branding', ['scripts/brand-audit.mjs']],
];
let failures = 0;
for (const [name, args] of checks) {
  console.log(`\n=== ${name} ===`);
  const result = spawnSync(process.execPath, args, { stdio: 'inherit', cwd: process.cwd() });
  if (result.status !== 0) { failures++; console.error(`FAILED: ${name} (${result.status ?? result.error?.message})`); }
}
console.log(`\nStatic release checks: ${checks.length - failures}/${checks.length} passed`);
if (failures) process.exitCode = 1;

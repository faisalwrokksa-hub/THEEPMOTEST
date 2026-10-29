/** Dependency-free source checks; not a replacement for executing Zod validation. */
import { readFileSync } from 'node:fs';
const env = readFileSync('apps/api/src/common/env.ts', 'utf8');
const main = readFileSync('apps/api/src/main.ts', 'utf8');
const example = readFileSync('.env.example', 'utf8');
const checks = [
  ['All configured CORS origins are iterated', env.includes("env.WEB_ORIGIN.split(',').map((s) => s.trim())") && env.includes('for (const origin of origins)')],
  ['Every production origin must be HTTPS', env.includes("secureDeployment && url.protocol !== 'https:'") && env.includes('requiresSecureTransport')],
  ['Wildcard and empty origins rejected', env.includes("!origin || origin === '*'" )],
  ['Origins prohibit paths and non-HTTP schemes', env.includes('url.origin !== origin') && env.includes("['http:', 'https:']")],
  ['Proxy trust validated and bounded', env.includes('TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(10).default(1)')],
  ['API uses configured proxy hops', main.includes("app.set('trust proxy', env.TRUST_PROXY_HOPS)")],
  ['Production config knobs documented', example.includes('TRUST_PROXY_HOPS=1') && example.includes('WEB_ORIGIN=http://localhost:3000')],
];
let failures=0;
for (const [name, ok] of checks) { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`); if (!ok) failures++; }
console.log(`${checks.length-failures}/${checks.length} production configuration static checks passed`);
if (failures) process.exitCode=1;

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
const pnpm = spawnSync('pnpm', ['--version'], { encoding: 'utf8', timeout: 8000 });
const checks = [
  ['Node.js >= 22', Number(process.versions.node.split('.')[0]) >= 22],
  ['pnpm available', pnpm.status === 0],
  ['workspace dependencies installed', existsSync('node_modules/.pnpm')],
  ['database URL configured', Boolean(process.env.DATABASE_URL)],
  ['web origin configured', Boolean(process.env.WEB_ORIGIN)],
];
let blocked = 0;
for (const [name, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'BLOCKED'}: ${name}`);
  if (!ok) blocked++;
}
console.log(`Runtime preflight: ${checks.length - blocked}/${checks.length} ready`);
if (blocked) process.exitCode = 1;

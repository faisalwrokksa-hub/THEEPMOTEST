import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
const roots = ['apps', 'packages', 'infra', 'scripts', 'tests'];
const skip = new Set(['node_modules', 'dist', '.next', '.git', 'coverage']);
const oldBrand = /align[ -]?360|pmoalign/ig;
const knownCompatibility = /pm@pmoalign\.test|pmoalign-dev|ALIGN360_(HOST|KEY)|align360-dev|\/opt\/align360|align360-mumbai\.pem/i;
let safe = 0, outstanding = 0;
function pathIgnore(name) { return name === 'brand-audit.mjs' || name === 'leak.mjs'; }
function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (skip.has(entry.name) || pathIgnore(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) { walk(path); continue; }
    if (!/\.(ts|tsx|js|mjs|css|json|md|html|yml|yaml|sh|env|example)$/.test(entry.name)) continue;
    const data = readFileSync(path, 'utf8');
    for (const [i, line] of data.split('\n').entries()) {
      if (!oldBrand.test(line)) continue;
      oldBrand.lastIndex = 0;
      const compatibility = knownCompatibility.test(line);
      console.log(`${compatibility ? 'COMPATIBILITY' : 'REVIEW'} ${path}:${i + 1}: ${line.trim().slice(0, 180)}`);
      compatibility ? safe++ : outstanding++;
    }
  }
}
for (const root of roots) walk(root);
console.log(`Brand audit: ${outstanding} items to review; ${safe} compatibility references retained.`);
if (outstanding) process.exitCode = 1;

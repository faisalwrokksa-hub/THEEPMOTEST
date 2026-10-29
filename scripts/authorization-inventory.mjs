/** Read-only inventory; does not claim controllers are authorized by decorators. */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
const root = 'apps/api/src';
const controllers = [];
function scan(dir) {
  for (const e of readdirSync(dir, {withFileTypes:true})) {
    const file=join(dir,e.name);
    if (e.isDirectory()) scan(file);
    else if (e.name.endsWith('.controller.ts')) {
      const source=readFileSync(file,'utf8');
      const verbs=[...source.matchAll(/@(Get|Post|Patch|Put|Delete)\s*\(/g)].map(m=>m[1]);
      controllers.push({file, endpoints:verbs.length, mutations:verbs.filter(v=>v!=='Get').length, localCapabilityChecks:(source.match(/requireCapability\s*\(/g)||[]).length});
    }
  }
}
scan(root);
console.log('Authorization inventory (route counts only; guards/services require runtime review):');
for (const c of controllers) console.log(`${c.file}: ${c.endpoints} routes, ${c.mutations} mutations, ${c.localCapabilityChecks} direct capability checks`);
console.log(`Total: ${controllers.length} controllers, ${controllers.reduce((n,c)=>n+c.endpoints,0)} route decorators`);

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('admin bearer-token embedding is disabled by default',()=>{
 const src=readFileSync(new URL('../apps/api/src/microsoft/microsoft.service.ts',import.meta.url),'utf8');
 assert.match(src,/requireCapability\('pmoa_admin'\);\s*\/\/ A workspace-wide delegated token/);
 assert.match(src,/MS_ALLOW_LEGACY_ADMIN_EMBED !== 'true'/);
 assert.match(src,/disabled pending per-user Microsoft authorization/);
});

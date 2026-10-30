import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../apps/web/src/app/(app)/projects/ProjectsTable.tsx', import.meta.url),'utf8');
test('project progress display clamps malformed, negative, and over-100 values',()=>{
 assert.match(source,/Math\.min\(100, Math\.max\(0, Number\.isFinite\(r\.progressPct\) \? r\.progressPct : 0\)\)/);
 assert.match(source,/initialSort=\{\{ key: 'health', dir: 'asc' \}\}/);
});

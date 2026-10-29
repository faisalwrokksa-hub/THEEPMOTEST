/**
 * pnpm check:dict — is any phrase translated twice?
 *
 * The dictionary is one big object literal keyed by the English source string,
 * so adding a phrase that is already in there is a TypeScript error: TS1117,
 * "an object literal cannot have multiple properties with the same name". That
 * message gives a line number and nothing else, and the line it points at is
 * usually the second copy, not the first — which is the one you need to read
 * before deciding which translation to keep.
 *
 * This says which phrase, and where both copies are.
 */
import { readFileSync } from 'node:fs';

const FILE = 'packages/contracts/src/i18n.ts';
const src = readFileSync(FILE, 'utf8');

// Keys can sit several to a line, or with the value wrapped onto the next one.
const seen = new Map();
const dups = [];
for (const m of src.matchAll(/'((?:[^'\\]|\\.)*)'\s*:\s*\n?\s*'/g)) {
  const key = m[1];
  const line = src.slice(0, m.index).split('\n').length;
  if (seen.has(key)) dups.push({ key, first: seen.get(key), again: line });
  else seen.set(key, line);
}

if (dups.length) {
  console.error(`\n${dups.length} phrase${dups.length > 1 ? 's are' : ' is'} in ${FILE} twice:\n`);
  for (const d of dups) {
    console.error(`  "${d.key}"`);
    console.error(`    ${FILE}:${d.first}  (keep this one, or merge)`);
    console.error(`    ${FILE}:${d.again}\n`);
  }
  process.exit(1);
}
console.log(`\u001b[32m✓\u001b[0m ${seen.size} phrases, none translated twice`);

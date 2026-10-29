/**
 * Finds a translate function shadowed by a loop variable.
 *
 * `const t = await tr()` is the translator. Writing `.map((t) => …)` inside
 * that scope rebinds `t` to the row, so any `t('…')` in the loop calls a row
 * object and the page dies with "t is not a function" — minified in
 * production to something as unhelpful as "a is not a function".
 *
 * It has happened twice: once in three report pages, once in Platform Studio,
 * where it reached customers. TypeScript does not catch it because the rows
 * are `any`. This does.
 */
import { readFileSync } from 'node:fs';
import { globSync } from 'node:fs';

const files = globSync('apps/web/src/**/*.tsx');
let bad = 0;
for (const f of files) {
  const src = readFileSync(f, 'utf8');
  if (!/\bconst t = await tr\(\)|\bconst t = translator\(/.test(src)) continue;

  // Every place a callback parameter is named `t`.
  const re = /\((?:\(|)\s*t\s*(?::[^,)]+)?\s*(?:,\s*\w+\s*(?::[^,)]+)?\s*)?\)\s*=>/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    // Walk forward to the end of this callback by brace/paren depth.
    let i = re.lastIndex, depth = 0, end = src.length;
    for (; i < src.length; i++) {
      const c = src[i];
      if (c === '(' || c === '{') depth++;
      else if (c === ')' || c === '}') { if (depth === 0) { end = i; break; } depth--; }
    }
    const body = src.slice(re.lastIndex, end);
    // Any call at all — the first version of this check looked only for
    // t('a literal') and therefore missed the real bug, which was t(g).
    const call = body.match(/(?<![\w.$])t\(/);
    if (call) {
      const line = src.slice(0, re.lastIndex).split('\n').length;
      console.log(`  ${f}:${line}  a loop parameter named "t" shadows the translator, and t(...) is called inside`);
      bad++;
    }
  }
}
if (bad) { console.log(`\n${bad} shadowed translator call(s) — these crash the page at runtime.`); process.exit(1); }
console.log('  no shadowed translator calls');

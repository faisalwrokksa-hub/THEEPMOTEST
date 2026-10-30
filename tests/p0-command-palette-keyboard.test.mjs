import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../apps/web/src/components/CommandPalette.tsx', import.meta.url), 'utf8');

test('command palette keeps Tab and Shift+Tab inside the open dialog', () => {
  assert.match(source, /import \{ focusWrapTarget \} from '@\/lib\/focus-trap\.mjs'/);
  assert.match(source, /const dialog = useRef<HTMLDivElement>\(null\)/);
  assert.match(source, /ref=\{dialog\}/);
  assert.match(source, /if \(e\.key !== 'Tab'\) return;/);
  assert.match(source, /focusWrapTarget\(document\.activeElement, focusable, e\.shiftKey\)/);
  assert.match(source, /if \(target\) \{ e\.preventDefault\(\); target\.focus\(\); \}/);
});

test('Escape, Ctrl+K toggle and backdrop restore keyboard focus to the opener', () => {
  assert.match(source, /const trigger = useRef<HTMLButtonElement>\(null\)/);
  assert.match(source, /ref=\{trigger\}/);
  assert.match(source, /trigger\.current\?\.focus\(\)/);
  assert.match(source, /if \(e\.key === 'Escape'\) \{ e\.preventDefault\(\); close\(\); return; \}/);
  assert.match(source, /if \(open\) close\(\);/);
  assert.match(source, /className="cmdk-backdrop" onClick=\{\(\) => close\(\)\}/);
});

test('route selection does not steal focus from the destination page', () => {
  assert.match(source, /close\(false\); router\.push\(hits\[i\]\.href as Route\)/);
  assert.match(source, /<a href=\{c\.href\} onClick=\{\(\) => close\(false\)\}>/);
  assert.match(source, /role="dialog" aria-modal="true" aria-label=\{t\('Command palette'\)\}/);
  assert.match(source, /aria-label=\{t\('Search — command palette'\)\}/);
});

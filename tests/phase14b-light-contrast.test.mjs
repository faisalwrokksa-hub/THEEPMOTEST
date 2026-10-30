import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../apps/web/src/app/globals.css', import.meta.url), 'utf8');
const light = css.match(/:root\[data-theme='light'\]\s*\{([\s\S]*?)\n\}/)?.[1];

function lightToken(name) {
  assert.ok(light, 'light theme tokens must exist');
  const match = light.match(new RegExp('(?:^|\\n)\\s*' + name + ':\\s*(#[0-9a-f]{6})\\s*;', 'i'));
  assert.ok(match, `missing light theme token ${name}`);
  return match[1];
}

function luminance(hex) {
  const rgb = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  return rgb.map((x) => x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4)
    .reduce((sum, x, i) => sum + x * [0.2126, 0.7152, 0.0722][i], 0);
}

function contrast(fg, bg) {
  const [hi, lo] = [luminance(fg), luminance(bg)].sort((a, b) => b - a);
  return (hi + 0.05) / (lo + 0.05);
}

test('light-theme small text token meets WCAG AA against standard and raised surfaces', () => {
  const ink = lightToken('--ink-4');
  for (const surface of ['--surface', '--surface-2', '--surface-3']) {
    const ratio = contrast(ink, lightToken(surface));
    assert.ok(ratio >= 4.5, `${surface} contrast ${ratio.toFixed(2)}:1 is below 4.5:1`);
  }
});

test('small KPI and navigation labels retain the accessible token', () => {
  assert.match(css, /\.tile > span\s*\{[^}]*var\(--ink-4\)/s);
  assert.match(css, /\.rail-group\s*\{[^}]*var\(--ink-4\)/s);
});

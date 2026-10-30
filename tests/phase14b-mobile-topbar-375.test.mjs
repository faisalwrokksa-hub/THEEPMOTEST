import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../apps/web/src/app/globals.css', import.meta.url), 'utf8');
const account = readFileSync(new URL('../apps/web/src/components/TenantSwitcher.tsx', import.meta.url), 'utf8');
const command = readFileSync(new URL('../apps/web/src/components/CommandPalette.tsx', import.meta.url), 'utf8');
const mobile = css.slice(css.indexOf('/* P0 mobile navigation:' ));

test('375px navigation has a dedicated narrow-screen layout without removing essential actions', () => {
  assert.match(mobile, /@media \(max-width: 640px\)/);
  assert.match(mobile, /\.topbar\s*\{[^}]*padding-inline: 10px;[^}]*gap: 6px;/);
  assert.match(mobile, /\.topbar \.crumbs\s*\{ display: none; \}/);
  assert.match(mobile, /\.topbar \.kbtn\s*\{[^}]*inline-size: 32px;[^}]*font-size: 0;/);
  assert.match(mobile, /\.topbar \.kbtn kbd\s*\{ display: none; \}/);
  assert.match(mobile, /\.topbar \.switcher \.who\s*\{ display: none; \}/);
  assert.match(mobile, /\.topbar \.themeswitch button\s*\{[^}]*padding-inline: 6px;/);
});

test('compact account and search buttons retain bilingual accessible names', () => {
  assert.match(account, /aria-label=\{lang === 'ar' \? `الحساب ومساحة العمل: \$\{session\.tenantName\}` : `Account and workspace: \$\{session\.tenantName\}`\}/);
  assert.match(account, /aria-expanded=\{open\} aria-haspopup="dialog"/);
  assert.match(command, /aria-label=\{t\('Search — command palette'\)\}/);
});

/**
 * Execute with Node 22 (type stripping); no package installation required.
 * Exercises the pure browser/redirect logic and verifies coverage of all
 * mutating Next.js proxy routes. Not a replacement for browser tests.
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { isTrustedBrowserMutation, safeReturnPath } from '../apps/web/src/lib/browser-mutation.ts';
import { publicUrl } from '../apps/web/src/lib/public-url.ts';

let checked = 0;
const test = (name, fn) => { fn(); checked++; console.log(`PASS ${name}`); };
const approved = ['https://epmo.example', 'https://portal.epmo.example'];
const allowed = (origin, site) => isTrustedBrowserMutation(origin, site, approved);
test('approved same-origin POST', () => assert.equal(allowed(approved[0], 'same-origin'), true));
test('approved secondary origin', () => assert.equal(allowed(approved[1], 'same-site'), true));
test('attacker origin rejected', () => assert.equal(allowed('https://evil.example', 'same-site'), false));
test('cross-site provenance denied even with approved Origin', () => assert.equal(allowed(approved[0], 'cross-site'), false));
test('opaque Origin denied', () => assert.equal(allowed('null', 'none'), false));
test('empty production allowlist rejects even same-origin metadata', () =>
  assert.equal(isTrustedBrowserMutation(null, 'same-origin', []), false));
test('no Origin, cross-site denied', () => assert.equal(allowed(null, 'cross-site'), false));
test('no Origin, no metadata denied', () => assert.equal(allowed(null, null), false));
test('same-origin Fetch Metadata permits missing Origin', () => assert.equal(allowed(null, 'same-origin'), true));
test('sibling subdomain without exact allowlist denied', () => assert.equal(allowed('https://other.epmo.example', 'same-site'), false));

test('local redirect path with query is preserved', () => assert.equal(safeReturnPath('/projects?q=1', '/'), '/projects?q=1'));
test('protocol-relative URL rejected', () => assert.equal(safeReturnPath('//evil.example', '/'), '/'));
test('backslash redirect rejected', () => assert.equal(safeReturnPath('/\\evil.example', '/governance'), '/governance'));
test('absolute URL rejected', () => assert.equal(safeReturnPath('https://evil.example', '/'), '/'));
test('javascript scheme rejected', () => assert.equal(safeReturnPath('javascript:alert(1)', '/'), '/'));
test('plain relative URL rejected', () => assert.equal(safeReturnPath('profile', '/'), '/'));

const makeReq = (headers = {}) => ({
  headers: new Headers(headers),
  nextUrl: { origin: 'http://localhost:3000' },
});
const oldEnv = process.env.WEB_ORIGIN;
const oldMode = process.env.NODE_ENV;
try {
  process.env.WEB_ORIGIN = approved.join(',');
  process.env.NODE_ENV = 'production';
  test('unapproved Host cannot poison redirect', () => {
    const req = makeReq({ host: 'evil.example', 'x-forwarded-host': 'evil.example', 'x-forwarded-proto': 'https' });
    assert.equal(publicUrl(req, '/login').href, 'https://epmo.example/login');
  });
  test('approved secondary forwarded host retained', () => {
    const req = makeReq({ 'x-forwarded-host': 'portal.epmo.example', 'x-forwarded-proto': 'https' });
    assert.equal(publicUrl(req, '/login').href, 'https://portal.epmo.example/login');
  });
  process.env.WEB_ORIGIN = '';
  test('production redirects fail closed without configured origin', () =>
    assert.throws(() => publicUrl(makeReq({ host: 'evil.example' }), '/'), /WEB_ORIGIN must be configured/));
  process.env.NODE_ENV = 'development';
  test('local development uses Next request origin', () =>
    assert.equal(publicUrl(makeReq(), '/login').href, 'http://localhost:3000/login'));
} finally {
  if (oldEnv === undefined) delete process.env.WEB_ORIGIN; else process.env.WEB_ORIGIN = oldEnv;
  if (oldMode === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = oldMode;
}

function routes(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((item) => {
    const full = join(dir, item.name);
    return item.isDirectory() ? routes(full) : item.name === 'route.ts' ? [full] : [];
  });
}
let mutating = 0;
for (const path of routes('apps/web/src/app')) {
  const src = readFileSync(path, 'utf8');
  if (!/export\s+(?:async\s+function|const)\s+(?:POST|PATCH|PUT|DELETE)\b/.test(src)) continue;
  mutating++;
  assert.match(src, /rejectUnsafeBrowserMutation\(req\)/,
    `Mutating browser route lacks origin guard: ${path}`);
}
test(`${mutating} mutating Next.js routes protected`, () => assert.ok(mutating >= 11));
const compose = readFileSync('docker-compose.prod.yml', 'utf8');
test('production web and API receive WEB_ORIGIN', () => {
  assert.equal((compose.match(/^\s+WEB_ORIGIN: \$\{WEB_ORIGIN:\?set WEB_ORIGIN\}/gm) ?? []).length, 2);
});
console.log(`\n${checked}/${checked} web-boundary checks passed`);

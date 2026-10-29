import test from 'node:test';
import assert from 'node:assert/strict';
import { assertLocalWebOrigin, verifyWebSmoke } from './phase15d-web-smoke.mjs';
const ORIGIN = 'http://127.0.0.1:3000';
function response(status, text = '', headers = {}) {
  return { status, headers: { get: name => headers[name.toLowerCase()] ?? null }, text: async () => text };
}
const page = (lang, dir, text) => `<html lang="${lang}" dir="${dir}"><body><h1>${text}</h1><form method="post" action="/api/session"></form></body></html>`;
const loginEn = response(200, page('en', 'ltr', 'Sign in'), { 'content-type': 'text/html; charset=utf-8' });
const loginAr = response(200, page('ar', 'rtl', 'تسجيل الدخول'), { 'content-type': 'text/html' });
const protectedRoute = response(307, '', { location: '/login' });
function makeFetch(overrides = {}) {
  return async (url, options) => {
    const path = new URL(url).pathname;
    const key = path === '/login' && options.headers.cookie ? '/login-ar' : path;
    return overrides[key] ?? (key === '/login' ? loginEn : key === '/login-ar' ? loginAr : protectedRoute);
  };
}
test('accepts only local HTTP server roots', () => {
  assert.equal(assertLocalWebOrigin(ORIGIN), ORIGIN);
  assert.equal(assertLocalWebOrigin('http://localhost:3000'), 'http://localhost:3000');
});
test('rejects remote host and HTTPS production targets', () => {
  for (const url of ['https://theepmo.com', 'http://web.internal:3000', 'https://localhost:3000'])
    assert.throws(() => assertLocalWebOrigin(url), /local HTTP/);
});
test('rejects credentials, paths and query parameters', () => {
  for (const url of ['http://user:pass@localhost:3000', 'http://localhost:3000/billing', 'http://localhost:3000/?token=secret'])
    assert.throws(() => assertLocalWebOrigin(url), /local HTTP/);
});
test('accepts bilingual HTML and four login redirects', async () => {
  const result = await verifyWebSmoke(ORIGIN, makeFetch());
  assert.equal(result.passed, true);
  assert.equal(result.checks.length, 6);
});
test('requests Arabic with locale cookie and refuses implicit redirects', async () => {
  const seen = [];
  await verifyWebSmoke(ORIGIN, async (url, options) => {
    seen.push({ url, ...options });
    return makeFetch()(url, options);
  });
  assert.equal(seen[1].headers.cookie, 'pmo_lang=ar');
  assert.ok(seen.every(req => req.redirect === 'manual' && req.method === 'GET'));
});
test('rejects an untranslated Arabic page', async () =>
  assert.rejects(verifyWebSmoke(ORIGIN, makeFetch({ '/login-ar': loginEn })), /language\/direction mismatch/));
test('rejects wrong direction on root html', async () =>
  assert.rejects(verifyWebSmoke(ORIGIN, makeFetch({ '/login-ar': response(200, page('ar', 'ltr', 'تسجيل الدخول'), { 'content-type': 'text/html' }) })), /mismatch/));
test('rejects missing login form', async () =>
  assert.rejects(verifyWebSmoke(ORIGIN, makeFetch({ '/login': response(200, '<html lang="en" dir="ltr">Sign in</html>', { 'content-type': 'text/html' }) })), /form missing/));
test('rejects non-HTML login responses', async () =>
  assert.rejects(verifyWebSmoke(ORIGIN, makeFetch({ '/login': response(200, page('en', 'ltr', 'Sign in'), { 'content-type': 'application/json' }) })), /not HTML/));
test('rejects unauthenticated private page returning HTTP 200', async () =>
  assert.rejects(verifyWebSmoke(ORIGIN, makeFetch({ '/billing': response(200) })), /did not redirect/));
test('rejects private redirect to an external host', async () =>
  assert.rejects(verifyWebSmoke(ORIGIN, makeFetch({ '/billing': response(307, '', { location: 'https://other.example/login' }) })), /did not stay/));
test('rejects redirects to other internal routes', async () =>
  assert.rejects(verifyWebSmoke(ORIGIN, makeFetch({ '/billing': response(307, '', { location: '/billing' }) })), /did not stay/));
test('rejects missing redirect location', async () =>
  assert.rejects(verifyWebSmoke(ORIGIN, makeFetch({ '/billing': response(307) })), /location missing/));
test('rejects login errors and missing content', async () =>
  assert.rejects(verifyWebSmoke(ORIGIN, makeFetch({ '/login': response(500, 'internal error', { 'content-type': 'text/html' }) })), /expected HTTP 200/));

#!/usr/bin/env node
/**
 * Phase 15D: read-only acceptance of a RUNNING, compiled Next.js web server.
 * Uses no credentials, mutating requests, or external hosts. Intended for CI
 * after API + standalone web startup, not as an offline replacement for it.
 */
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const PRIVATE_ROUTES = Object.freeze(['/billing', '/super-admin', '/getting-started', '/projects']);
const allowedRedirects = new Set([302, 303, 307, 308]);

export function assertLocalWebOrigin(input) {
  let url;
  try { url = new URL(input); }
  catch { throw new Error('Web smoke test requires a valid local HTTP URL'); }
  if (url.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
      url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('Web smoke test must target the root of a local HTTP server; remote production URLs are forbidden');
  }
  return url.origin;
}

function assertHtml(res, body, label, lang, dir, expectedText) {
  if (res.status !== 200) throw new Error(`${label}: expected HTTP 200, got ${res.status}`);
  if (!String(res.headers.get('content-type') || '').toLowerCase().includes('text/html'))
    throw new Error(`${label}: response is not HTML`);
  const html = body.match(/<html\b[^>]*>/i)?.[0] || '';
  if (!new RegExp(`\\blang=["']${lang}["']`, 'i').test(html) ||
      !new RegExp(`\\bdir=["']${dir}["']`, 'i').test(html))
    throw new Error(`${label}: root HTML language/direction mismatch`);
  if (!body.includes(expectedText)) throw new Error(`${label}: localized sign-in text missing`);
  if (!/<form\b[^>]*\baction=["']\/api\/session["']/i.test(body))
    throw new Error(`${label}: expected sign-in form missing`);
  if (/<meta\b[^>]*http-equiv=["']refresh["']/i.test(body))
    throw new Error(`${label}: unexpected client-side redirect`);
}

function assertLoginRedirect(res, label, origin) {
  if (!allowedRedirects.has(res.status))
    throw new Error(`${label}: protected route did not redirect (HTTP ${res.status})`);
  const location = res.headers.get('location');
  if (!location) throw new Error(`${label}: redirect location missing`);
  let destination;
  try { destination = new URL(location, origin); }
  catch { throw new Error(`${label}: redirect URL invalid`); }
  if (destination.origin !== origin || destination.pathname !== '/login')
    throw new Error(`${label}: redirect did not stay on the local login page`);
}

export async function verifyWebSmoke(originInput, fetchFn = fetch) {
  const origin = assertLocalWebOrigin(originInput);
  const checks = [];
  async function request(path, headers = {}) {
    const res = await fetchFn(`${origin}${path}`, {
      method: 'GET', headers, redirect: 'manual', signal: AbortSignal.timeout(10000),
    });
    return res;
  }
  for (const locale of [
    { lang: 'en', dir: 'ltr', text: 'Sign in', label: 'English login', cookies: {} },
    { lang: 'ar', dir: 'rtl', text: 'تسجيل الدخول', label: 'Arabic login', cookies: { cookie: 'pmo_lang=ar' } },
  ]) {
    const res = await request('/login', locale.cookies);
    const body = await res.text();
    assertHtml(res, body, locale.label, locale.lang, locale.dir, locale.text);
    checks.push(locale.label);
  }
  for (const path of PRIVATE_ROUTES) {
    const response = await request(path);
    assertLoginRedirect(response, path, origin);
    checks.push(`${path} requires authentication`);
  }
  return { passed: true, checks };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  verifyWebSmoke(process.env.PHASE15D_WEB_URL || 'http://127.0.0.1:3000')
    .then(result => {
      for (const name of result.checks) console.log(`PASS ${name}`);
      console.log(`PASS Phase 15D running-web acceptance: ${result.checks.length} checks`);
    })
    .catch(error => {
      console.error(`BLOCKED Phase 15D running-web acceptance: ${error.message}`);
      process.exitCode = 1;
    });
}

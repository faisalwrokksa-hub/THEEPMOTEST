#!/usr/bin/env node
/**
 * LOCAL, DISPOSABLE browser evidence only. Never use production accounts/data.
 * Public mode (CI): screenshots and Playwright traces without credentials.
 * Synthetic mode (manual): credentials are used before tracing starts and are
 * never written to evidence. This is NOT public HTTPS staging acceptance.
 */
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  assertLocalUatOrigin, assertSyntheticUser, assertUatOutputDir,
  evidenceName, UAT_VARIANTS, PUBLIC_ROUTES, SYNTHETIC_ROUTES, PRIVATE_ROUTES,
} from './frontend-browser-uat-policy.mjs';

const origin = assertLocalUatOrigin(process.env.EPMO_UAT_URL || 'http://127.0.0.1:3000');
const mode = process.env.EPMO_UAT_MODE || 'public';
if (!['public', 'synthetic'].includes(mode)) throw new Error('UAT mode must be public or synthetic');
const user = mode === 'synthetic' ? assertSyntheticUser(process.env.EPMO_UAT_USER) : null;
const password = mode === 'synthetic' ? process.env.EPMO_UAT_PASSWORD : null;
if (mode === 'synthetic' && !password) throw new Error('Synthetic local UAT requires EPMO_UAT_PASSWORD');
const out = assertUatOutputDir(process.env.EPMO_UAT_OUT);
await mkdir(out, { recursive: true, mode: 0o700 });
const report = { scope: 'LOCAL_DISPOSABLE_ONLY_NOT_STAGING_ACCEPTANCE', mode, variants: [], passed: 0, failed: 0 };
let browser;
try {
  browser = await chromium.launch({ headless: true });
  for (const variant of UAT_VARIANTS) {
    const context = await browser.newContext({
      viewport: { width: variant.width, height: variant.height },
      locale: variant.lang === 'ar' ? 'ar-SA' : 'en-GB',
      deviceScaleFactor: 1, reducedMotion: 'reduce', colorScheme: 'light',
    });
    const result = { variant: variant.name, checks: [] };
    report.variants.push(result);
    // The app loads Google Fonts; block remote traffic to keep CI isolated.
    await context.route('**/*', route => {
      let permitted = false;
      try {
        const url = new URL(route.request().url());
        permitted = url.origin === origin || ['data:', 'blob:'].includes(url.protocol);
      } catch { /* fail closed */ }
      return permitted ? route.continue() : route.abort();
    });
    await context.addCookies([{ name: 'pmo_lang', value: variant.lang, url: origin }]);
    const page = await context.newPage();
    page.on('dialog', dialog => { void dialog.dismiss(); });
    let tracing = false;
    try {
      if (mode === 'synthetic') {
        await page.goto(`${origin}/login`, { waitUntil: 'domcontentloaded', timeout: 20000 });
        await page.locator('input[name="identifier"]').fill(user);
        await page.locator('input[name="password"]').fill(password);
        await Promise.all([
          page.waitForURL(url => url.origin === origin && url.pathname !== '/login', { timeout: 30000 }),
          page.locator('button[type="submit"]').click(),
        ]);
        // Never record the login interaction or credential-bearing form.
      }
      await context.tracing.start({ screenshots: true, snapshots: true, sources: false });
      tracing = true;
      for (const path of mode === 'public' ? PUBLIC_ROUTES : SYNTHETIC_ROUTES) {
        const id = evidenceName(variant.name, path);
        try {
          const response = await page.goto(`${origin}${path}`, { waitUntil: 'domcontentloaded', timeout: 20000 });
          if (!response) throw new Error('missing_response');
          const url = new URL(page.url());
          const expectedPath = mode === 'public' && PRIVATE_ROUTES.has(path) ? '/login' : path;
          if (url.origin !== origin || url.pathname !== expectedPath) throw new Error('unexpected_redirect');
          if (response.status() >= 400) throw new Error('http_error');
          const pageState = await page.evaluate(() => ({
            lang: document.documentElement.lang,
            dir: document.documentElement.dir,
            h1: !!document.querySelector('h1'),
            scrollWidth: document.documentElement.scrollWidth,
            viewportWidth: window.innerWidth,
          }));
          if (pageState.lang !== variant.lang || pageState.dir !== variant.dir) throw new Error('html_locale_direction');
          if (!pageState.h1) throw new Error('missing_heading');
          if (pageState.scrollWidth > pageState.viewportWidth + 2) throw new Error('horizontal_overflow');
          if (mode === 'synthetic' && !(await page.locator('main#main').count())) throw new Error('missing_authenticated_shell');
          if (path === '/login' && mode === 'public') {
            if (!(await page.locator('form[action="/api/session"] input[name="password"]').count()))
              throw new Error('missing_accessible_login');
          }
          await page.screenshot({ path: join(out, `${id}.png`), fullPage: true, animations: 'disabled' });
          result.checks.push({ path, status: 'PASS', screenshot: `${id}.png` });
          report.passed++;
        } catch (error) {
          // No exception stacks, HTML bodies, request headers, or credentials in evidence.
          const known = new Set(['missing_response','unexpected_redirect','http_error','html_locale_direction','missing_heading','horizontal_overflow','missing_authenticated_shell','missing_accessible_login']);
          const code = known.has(error?.message) ? error.message : 'browser_check_failed';
          result.checks.push({ path, status: 'FAIL', code });
          report.failed++;
        }
      }
    } catch {
      result.checks.push({ path: 'authentication_or_browser_start', status: 'FAIL', code: 'synthetic_login_or_browser_failed' });
      report.failed++;
    } finally {
      if (tracing) {
        try { await context.tracing.stop({ path: join(out, `${variant.name}.zip`) }); }
        catch { result.checks.push({ path: 'trace', status: 'FAIL', code: 'trace_write_failed' }); report.failed++; }
      }
      await context.close();
    }
  }
} catch {
  report.failed++;
  report.variants.push({ variant: 'browser_start', checks: [{ path: 'launch', status: 'FAIL', code: 'browser_launch_failed' }] });
} finally {
  if (browser) await browser.close();
  await writeFile(join(out, 'report.json'), JSON.stringify(report, null, 2), { mode: 0o600 });
}
console.log(`LOCAL browser UAT: ${report.passed} passed, ${report.failed} failed; evidence ${out}`);
if (report.failed) process.exitCode = 1;

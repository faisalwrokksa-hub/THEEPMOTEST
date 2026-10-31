#!/usr/bin/env node
/**
 * F44: real browser customer journeys against a DISPOSABLE LOOPBACK stack.
 * Requires two distinct .test accounts with admin and restricted roles.
 * Does not use real invitations, send recovery email, change workspace data,
 * or claim HTTPS staging/provider acceptance. No credential-bearing traces.
 */
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { journeyConfiguration, JOURNEY_VARIANTS, assertJourneyLayout, assertMutationRedirect } from './frontend-customer-journey-policy.mjs';

const cfg = journeyConfiguration(process.env);
await mkdir(cfg.out, { recursive: true, mode: 0o700 });
const report = { scope: 'LOCAL_DISPOSABLE_SYNTHETIC_ONLY_NOT_STAGING_ACCEPTANCE', variants: [], passed: 0, failed: 0 };
const known = new Set([
  'locale_direction_failed', 'missing_heading', 'horizontal_overflow',
  'missing_invitation_error', 'missing_recovery_error', 'fragment_not_scrubbed',
  'authentication_failed', 'missing_admin_invitation_form', 'missing_billing_screen',
  'restricted_billing_access', 'restricted_invitation_access', 'mutation_not_rejected',
  'unsafe_mutation_redirect', 'unexpected_mutation_feedback', 'unexpected_auth_redirect',
]);
const fakeToken = '00000000-0000-4000-8000-000000000000.' + 'A'.repeat(43);
let browser;
try {
  browser = await chromium.launch({ headless: true });
  for (const variant of JOURNEY_VARIANTS) {
    const context = await browser.newContext({
      viewport: { width: variant.width, height: variant.height },
      locale: variant.lang === 'ar' ? 'ar-SA' : 'en-GB',
      reducedMotion: 'reduce', deviceScaleFactor: 1,
    });
    await context.route('**/*', route => {
      let permitted = false;
      try {
        const url = new URL(route.request().url());
        permitted = url.origin === cfg.origin || ['data:', 'blob:'].includes(url.protocol);
      } catch { /* fail closed */ }
      return permitted ? route.continue() : route.abort();
    });
    await context.addCookies([{ name: 'pmo_lang', value: variant.lang, url: cfg.origin }]);
    const page = await context.newPage();
    page.on('dialog', dialog => { void dialog.dismiss(); });
    const result = { variant: variant.name, checks: [] };
    report.variants.push(result);
    async function step(name, run) {
      try {
        await run();
        // Fixed-name screenshots only; never record authenticated traces or secrets.
        const capture = new Set([
          'expired_login_bilingual', 'recovery_503_no_success',
          'invitation_403_no_acceptance', 'admin_login_and_onboarding',
          'admin_subscription_read', 'restricted_login_and_no_invitation_form',
          'restricted_billing_redirect',
        ]);
        const screenshot = capture.has(name) ? variant.name + '-' + name + '.png' : undefined;
        if (screenshot) await page.screenshot({ path: join(cfg.out, screenshot), fullPage: true, animations: 'disabled' });
        result.checks.push({ name, status: 'PASS', ...(screenshot ? { screenshot } : {}) });
        report.passed++;
      } catch (error) {
        result.checks.push({ name, status: 'FAIL', code: known.has(error?.message) ? error.message : 'browser_journey_failed' });
        report.failed++;
      }
    }
    async function layout() {
      const state = await page.evaluate(() => ({
        lang: document.documentElement.lang, dir: document.documentElement.dir,
        heading: !!document.querySelector('h1'),
        scrollWidth: document.documentElement.scrollWidth,
      }));
      assertJourneyLayout(state, variant);
    }
    async function login(user, password) {
      await context.clearCookies();
      await context.addCookies([{ name: 'pmo_lang', value: variant.lang, url: cfg.origin }]);
      await page.goto(cfg.origin + '/login', { waitUntil: 'domcontentloaded' });
      await page.locator('input[name="identifier"]').fill(user);
      await page.locator('input[name="password"]').fill(password);
      await page.locator('button[type="submit"]').click();
      try {
        await page.waitForURL(url => url.origin === cfg.origin && url.pathname === '/', { timeout: 20000 });
      } catch { throw new Error('authentication_failed'); }
    }
    async function mutation(form) {
      return page.request.post(cfg.origin + '/api/onboarding', {
        data: new URLSearchParams(form).toString(),
        headers: { origin: cfg.origin, 'content-type': 'application/x-www-form-urlencoded' },
        maxRedirects: 0, timeout: 15000,
      });
    }
    try {
      await step('expired_login_bilingual', async () => {
        await page.goto(cfg.origin + '/login?error=expired', { waitUntil: 'domcontentloaded' });
        await page.getByRole('alert').waitFor();
        await layout();
      });
      await step('recovery_503_no_success', async () => {
        await page.route('**/api/password-recovery/request', route => route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }));
        await page.goto(cfg.origin + '/forgot-password', { waitUntil: 'domcontentloaded' });
        await page.locator('input[type="email"]').fill('journey-recovery@example.test');
        await page.locator('button[type="submit"]').click();
        await page.getByRole('alert').waitFor();
        if (await page.getByRole('status').count()) throw new Error('missing_recovery_error');
        await layout();
        await page.unroute('**/api/password-recovery/request');
      });
      await step('invitation_403_no_acceptance', async () => {
        await page.route('**/api/invite/accept', route => route.fulfill({ status: 403, contentType: 'application/json', body: '{}' }));
        await page.goto(cfg.origin + '/accept-invite#token=' + fakeToken, { waitUntil: 'domcontentloaded' });
        await page.locator('button[type="submit"]').waitFor();
        if (new URL(page.url()).hash) throw new Error('fragment_not_scrubbed');
        await page.locator('button[type="submit"]').click();
        await page.getByRole('alert').waitFor();
        await layout();
        await page.unroute('**/api/invite/accept');
      });
      await step('admin_login_and_onboarding', async () => {
        await login(cfg.admin, process.env.EPMO_JOURNEY_ADMIN_PASSWORD);
        await page.goto(cfg.origin + '/settings', { waitUntil: 'domcontentloaded' });
        await page.locator('form[action="/api/onboarding"] input[name="action"][value="invite"]').waitFor();
        await layout();
      });
      await step('admin_subscription_read', async () => {
        await page.goto(cfg.origin + '/billing', { waitUntil: 'domcontentloaded' });
        if (new URL(page.url()).pathname !== '/billing' ||
            !(await page.getByRole('heading', { level: 1 }).count()))
          throw new Error('missing_billing_screen');
        // A generic Loaded error/401/403 is not a successful billing journey.
        await page.locator('section[aria-label="Current subscription"], section[aria-label="الاشتراك الحالي"]').waitFor({ timeout: 15000 });
        if (await page.getByRole('alert').count()) throw new Error('missing_billing_screen');
        await layout();
      });
      await step('expired_onboarding_cookie_rejected', async () => {
        await context.clearCookies();
        const res = await mutation({ action: 'revoke', id: '00000000-0000-4000-8000-000000000000' });
        assertMutationRedirect(res.status(), res.headers()['location'], cfg.origin,
          { path: '/login', key: 'error', value: 'expired' });
      });
      await step('restricted_login_and_no_invitation_form', async () => {
        await login(cfg.restricted, process.env.EPMO_JOURNEY_RESTRICTED_PASSWORD);
        await page.goto(cfg.origin + '/settings', { waitUntil: 'domcontentloaded' });
        if (await page.locator('form[action="/api/onboarding"] input[name="action"][value="invite"]').count())
          throw new Error('restricted_invitation_access');
        await layout();
      });
      await step('restricted_onboarding_403', async () => {
        // Revoking a non-existent synthetic UUID cannot change a real invitation.
        const res = await mutation({ action: 'revoke', id: '00000000-0000-4000-8000-000000000000' });
        assertMutationRedirect(res.status(), res.headers()['location'], cfg.origin,
          { path: '/settings', key: 'onboarding', value: 'forbidden' });
      });
      await step('restricted_billing_redirect', async () => {
        await page.goto(cfg.origin + '/billing', { waitUntil: 'domcontentloaded' });
        if (new URL(page.url()).pathname !== '/') throw new Error('restricted_billing_access');
        await layout();
      });
    } finally {
      // Never save browser traces, storage state, cookies, credentials, or raw responses.
      await context.close();
    }
  }
} catch {
  report.failed++;
  report.variants.push({ variant: 'browser', checks: [{ name: 'launch', status: 'FAIL', code: 'browser_journey_failed' }] });
} finally {
  if (browser) await browser.close();
  await writeFile(join(cfg.out, 'customer-journey-report.json'), JSON.stringify(report, null, 2), { mode: 0o600 });
}
console.log('LOCAL synthetic customer journey: ' + report.passed + ' PASS, ' + report.failed + ' FAIL');
if (report.failed) process.exitCode = 1;

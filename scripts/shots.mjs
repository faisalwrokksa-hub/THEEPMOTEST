/**
 * Screenshots of the running app, signed in.
 *
 * Exists because CSS written without looking at it is guesswork. Run it,
 * open /tmp/shots, and judge the product the way a user sees it.
 *
 *   node scripts/shots.mjs [page ...]
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const WEB = process.env.WEB ?? 'http://localhost:3000';
const USER = process.env.SHOT_USER ?? 'ankit_aetherix';
const PASS = process.env.SHOT_PASS ?? 'pmo-dev@123';
const OUT = process.env.SHOT_DIR ?? '/tmp/shots';
const PAGES = process.argv.slice(2).length ? process.argv.slice(2)
  : ['/', '/projects', '/governance', '/analytics', '/financials', '/raid', '/platform'];

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const LANG = process.env.SHOT_LANG ?? 'en';
const ctx = await browser.newContext({ viewport: { width: 1512, height: 982 }, deviceScaleFactor: 2,
  locale: LANG === 'ar' ? 'ar-SA' : 'en-GB' });
// The language is a cookie the server reads, so it has to be set before the
// first render — switching it in the UI afterwards reloads every page anyway.
await ctx.addCookies([{ name: 'pmo_lang', value: LANG, url: WEB }]);
const page = await ctx.newPage();

await page.goto(`${WEB}/login`, { waitUntil: 'networkidle' });
await page.fill('input[name=identifier]', USER);
await page.fill('input[name=password]', PASS);
await Promise.all([page.waitForURL('**/', { timeout: 30000 }), page.click('button[type=submit]')]);

for (const p of PAGES) {
  await page.goto(`${WEB}${p}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  const name = p === '/' ? 'home' : p.replace(/^\//, '').replace(/\//g, '-');
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
  console.log(`  ${name}.png`);
}
await browser.close();

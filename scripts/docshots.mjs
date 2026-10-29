/** Screenshots for the documentation artifact: light, cropped, signed in. */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const WEB = 'http://localhost:3000';
const OUT = '/tmp/docshots';
const PAGES = [
  ['/', 'home'], ['/my-work', 'my-work'], ['/activity', 'attention'],
  ['/portfolios', 'portfolios'], ['/projects', 'projects'], ['/board', 'board'],
  ['/planner', 'planner'], ['/governance', 'governance'], ['/raid', 'raid'],
  ['/decisions', 'decisions'], ['/approvals', 'approvals'], ['/analytics', 'analytics'],
  ['/financials', 'financials'], ['/benefits', 'benefits'], ['/resources', 'resources'],
  ['/notifications', 'notifications'], ['/data', 'data'], ['/reports', 'reports'],
  ['/reports/board-pack', 'board-pack'], ['/documents', 'documents'], ['/updates', 'updates'],
  ['/stakeholders', 'stakeholders'], ['/studio', 'studio'], ['/integrations', 'integrations'],
  ['/settings', 'settings'], ['/platform', 'platform'], ['/ask', 'ask'],
];
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
for (const lang of ['en', 'ar']) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1, locale: lang === 'ar' ? 'ar-SA' : 'en-GB' });
  await ctx.addCookies([{ name: 'pmo_lang', value: lang, url: WEB }]);
  const page = await ctx.newPage();
  await page.goto(`${WEB}/login`, { waitUntil: 'networkidle' });
  await page.fill('input[name=identifier]', 'ankit_aetherix');
  await page.fill('input[name=password]', 'pmo-dev@123');
  await Promise.all([page.waitForURL('**/', { timeout: 30000 }), page.click('button[type=submit]')]);
  // Only a couple of screens are needed in Arabic to show the mirroring.
  const want = lang === 'ar' ? PAGES.filter(([, n]) => ['home', 'planner', 'analytics'].includes(n)) : PAGES;
  for (const [href, name] of want) {
    await page.goto(`${WEB}${href}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(350);
    const file = lang === 'ar' ? `ar-${name}` : name;
    await page.screenshot({ path: `${OUT}/${file}.png`, fullPage: true });
    console.log(' ', file);
  }
  await ctx.close();
}
await browser.close();

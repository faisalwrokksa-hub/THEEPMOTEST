/**
 * Finds English UI text left in the Arabic app.
 *
 * "Still English content showing in Arabic dashboard" is easy to say and hard
 * to chase by eye, because the offenders are scattered one phrase at a time.
 * So: render every screen in Arabic, walk the visible text nodes, and report
 * any Latin-script run that is not obviously data.
 *
 * Data is allowed through — project names, people, codes and money are the
 * customer's own words and translating them would be wrong. Everything else
 * is ours, and ours should be Arabic.
 */
import { chromium } from 'playwright';

const WEB = process.env.WEB ?? 'http://localhost:3000';
const USER = process.env.SHOT_USER ?? 'ankit_aetherix';
const PASS = process.env.SHOT_PASS ?? 'pmo-dev@123';

const PAGES = ['/', '/my-work', '/activity', '/portfolios', '/projects', '/board', '/planner',
  '/governance', '/raid', '/decisions', '/approvals', '/analytics', '/financials', '/benefits',
  '/resources', '/notifications', '/data', '/reports', '/documents', '/updates', '/stakeholders',
  '/studio', '/integrations', '/settings', '/platform', '/ask'];

// Names, codes and figures belong to the customer, not to us.
const DATA = [
  /^[A-Z]{2,6}$/,                       // project codes: ANR, RCM, JWH
  /^SG\s?\d$/,                          // gate numbers
  /^[\d.,%+\-/()\s]+$/,                 // pure numbers
  /^\d+(\.\d+)?[KMB]$/,                 // money
  /Al-Nakheel|Riyadh|Jeddah|Nexa|Aetherix|Fatima|Khalid|Ankit|Sharma|Zahrani|Align360/,
  /^[\w.+-]+@[\w.-]+$/,                 // emails
  /^https?:/,
  /^\d{4}-\d{2}(-\d{2})?$/,             // dates on axes
  /Contractor has not submitted|Primavera|SharePoint|Power BI|WhatsApp|Jira|Excel|PDF|Word|PowerPoint/,
];
const isData = (s) => DATA.some((r) => r.test(s));
const latin = /[A-Za-z]{2,}/;

const browser = await chromium.launch();
const ctx = await browser.newContext({ locale: 'ar-SA', viewport: { width: 1512, height: 1000 } });
await ctx.addCookies([{ name: 'pmo_lang', value: 'ar', url: WEB }]);
const page = await ctx.newPage();
await page.goto(`${WEB}/login`, { waitUntil: 'networkidle' });
await page.fill('input[name=identifier]', USER);
await page.fill('input[name=password]', PASS);
await Promise.all([page.waitForURL('**/', { timeout: 30000 }), page.click('button[type=submit]')]);
await ctx.addCookies([{ name: 'pmo_lang', value: 'ar', url: WEB }]);

let total = 0;
for (const p of PAGES) {
  await page.goto(`${WEB}${p}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(250);
  const found = await page.evaluate(`(() => {
    const out = [];
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      const s = (n.textContent || '').trim();
      if (!s) continue;
      const el = n.parentElement;
      if (!el || el.closest('script,style,svg title')) continue;
      if (!el.offsetParent && el.tagName !== 'OPTION') continue;
      out.push(s);
    }
    return [...new Set(out)];
  })()`);
  const leaks = found.filter((s) => latin.test(s) && !isData(s));
  if (leaks.length) {
    console.log(`\n${p}`);
    for (const l of leaks.slice(0, 14)) console.log(`   ${l.slice(0, 90)}`);
    total += leaks.length;
  }
}
console.log(`\n${total} English strings left in the Arabic UI`);
await browser.close();

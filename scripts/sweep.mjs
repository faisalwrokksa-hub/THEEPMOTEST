/**
 * Photograph every screen, in both languages and both themes.
 *
 * The point is to judge the product in one sitting rather than discovering
 * one broken screen at a time. Writes a contact sheet to /tmp/sweep.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const WEB = process.env.WEB ?? 'http://localhost:3000';
const OUT = process.env.SWEEP_DIR ?? '/tmp/sweep';
const USER = process.env.SHOT_USER ?? 'ankit_aetherix';
const PASS = process.env.SHOT_PASS ?? 'pmo-dev@123';

const PAGES = ['/', '/my-work', '/activity', '/portfolios', '/projects', '/board', '/planner',
  '/governance', '/raid', '/decisions', '/approvals', '/analytics', '/financials', '/benefits',
  '/resources', '/reports', '/reports/board-pack', '/documents', '/updates', '/stakeholders',
  '/studio', '/integrations', '/settings', '/platform', '/data', '/notifications', '/ask'];

const VARIANTS = process.env.SWEEP_ALL
  ? [['light-en','light','en'], ['dark-en','dark','en'], ['light-ar','light','ar']]
  : [['light-en','light','en']];

mkdirSync(OUT, { recursive: true });
const b = await chromium.launch();

for (const [tag, scheme, lang] of VARIANTS) {
  mkdirSync(`${OUT}/${tag}`, { recursive: true });
  const ctx = await b.newContext({ viewport:{width:1512,height:1000}, deviceScaleFactor:1,
                                   colorScheme: scheme });
  const p = await ctx.newPage();
  await p.goto(`${WEB}/login`, { waitUntil:'networkidle' });
  await p.fill('input[name=identifier]', USER);
  await p.fill('input[name=password]', PASS);
  await Promise.all([p.waitForURL('**/',{timeout:30000}), p.click('button[type=submit]')]);
  if (lang === 'ar') await ctx.addCookies([{ name:'pmo_lang', value:'ar', url: WEB }]);

  for (const path of PAGES) {
    const name = path === '/' ? 'home' : path.replace(/^\//,'').replace(/\//g,'-');
    try {
      await p.goto(`${WEB}${path}`, { waitUntil:'networkidle', timeout: 45000 });
      await p.waitForTimeout(250);
      await p.screenshot({ path: `${OUT}/${tag}/${name}.png`, fullPage: true });
    } catch (e) {
      console.log(`  ! ${tag}/${name}: ${e.message.split('\n')[0]}`);
    }
  }
  console.log(`  ${tag}: ${PAGES.length} screens`);
  await ctx.close();
}
await b.close();

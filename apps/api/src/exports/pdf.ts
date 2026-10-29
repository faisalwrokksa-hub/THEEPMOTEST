import { Logger } from '@nestjs/common';
import { chromium, type Browser } from 'playwright-core';

/**
 * PDF by printing the real page in a real browser.
 *
 * Every PDF library available to a Node service writes glyphs in the order it
 * is given them. Arabic needs the opposite: letters change shape according to
 * their neighbours, and a line mixing Arabic with Latin and digits has to be
 * reordered by the bidirectional algorithm before anything is drawn. Those
 * libraries do neither, so Arabic comes out as disconnected letters in the
 * wrong order — which is worse than no PDF at all.
 *
 * A browser does both, correctly, and has done for twenty years. So the PDF is
 * the board pack page printed by headless Chromium, using the same print
 * stylesheet as the browser's own Print command. The cost is Chromium in the
 * image; the benefit is that the Arabic is right and the PDF always matches
 * the screen, because it *is* the screen.
 */
const log = new Logger('Pdf');

/** Kept warm between requests: a cold Chromium launch is about a second. */
let browser: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (browser?.isConnected()) return browser;
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
    args: [
      '--no-sandbox',                 // the container is the sandbox
      '--disable-dev-shm-usage',      // /dev/shm is tiny in a container
      '--font-render-hinting=none',
    ],
  });
  browser.on('disconnected', () => { browser = null; });
  return browser;
}

export async function closeBrowser() {
  await browser?.close().catch(() => {});
  browser = null;
}

/*
 * Wait until the fonts the *print* stylesheet asks for have actually arrived.
 *
 * Two traps sit here, and the board pack fell into both.
 *
 * The print stylesheet names different families from the screen one, and a
 * browser only fetches a webfont once something on the page needs it. So the
 * fetch cannot even begin until after emulateMedia() switches the media type.
 *
 * Worse, `document.fonts.ready` resolves immediately if nothing is loading
 * yet — and right after the switch, nothing is, because layout has not re-run.
 * Awaiting it there is a no-op that races the download it was meant to wait
 * for; print then falls back to a default serif, which is how an English board
 * pack came out in Times with Inter sitting in the stylesheet all along.
 *
 * So: force layout, ask for each face by name, and only then wait. Asking by
 * name is what makes this deterministic rather than a sleep that happens to be
 * long enough on a warm cache and too short on a cold one.
 */
const PRINT_FACES = [
  '400 13px Manrope', '500 13px Manrope', '600 13px Manrope', '700 13px Manrope',
  '400 13px Manrope', '700 13px Manrope',
  '400 13px "Noto Kufi Arabic"', '700 13px "Noto Kufi Arabic"',
];

async function waitForPrintFonts(page: import('playwright-core').Page) {
  const missing = await page.evaluate(`(async () => {
    // Reading offsetHeight forces the print layout, so the faces below are
    // requested rather than merely declared.
    void document.body.offsetHeight;
    const want = ${JSON.stringify(PRINT_FACES)};
    await Promise.all(want.map((f) => document.fonts.load(f).catch(() => {})));
    await document.fonts.ready;
    return want.filter((f) => !document.fonts.check(f));
  })()`).catch(() => null) as string[] | null;

  // A missing face is not worth failing an export over — the reader would
  // rather have the pack in a fallback face than no pack at all — but it is
  // worth saying out loud, because it is invisible until someone opens the PDF.
  if (missing?.length) log.warn(`Printing without: ${missing.join(', ')}`);
}

export type PrintOptions = {
  /** Where the web app is reachable from inside the network. */
  origin: string;
  path: string;
  /** The reader's session, so the page renders their workspace and nobody else's. */
  sessionToken: string;
  lang: 'en' | 'ar';
  /** Landscape suits a gate table; portrait suits a narrative pack. */
  landscape?: boolean;
};

export async function printToPdf(o: PrintOptions): Promise<Buffer> {
  const b = await getBrowser();
  const ctx = await b.newContext({
    viewport: { width: 1280, height: 1600 },
    locale: o.lang === 'ar' ? 'ar-SA' : 'en-GB',
  });
  try {
    const url = new URL(o.path, o.origin);
    await ctx.addCookies([
      { name: 'pmo_session', value: o.sessionToken, url: url.origin },
      { name: 'pmo_lang', value: o.lang, url: url.origin },
    ]);

    const page = await ctx.newPage();
    const res = await page.goto(url.toString(), { waitUntil: 'networkidle', timeout: 45_000 });
    if (!res || res.status() >= 400) {
      throw new Error(`The page returned ${res?.status() ?? 'nothing'}`);
    }
    await page.emulateMedia({ media: 'print' });
    await waitForPrintFonts(page);

    const pdf = await page.pdf({
      format: 'A4',
      landscape: Boolean(o.landscape),
      printBackground: true,
      margin: { top: '14mm', bottom: '16mm', left: '12mm', right: '12mm' },
      displayHeaderFooter: true,
      headerTemplate: '<div></div>',
      /*
       * The header and footer render in their own little document, which does
       * not inherit the page's stylesheet — so an unstyled footer comes out in
       * Chromium's default serif, and the pack ends up with Times page numbers
       * under Inter body text. The family has to be named here explicitly.
       */
      footerTemplate:
        `<div style="width:100%;font-size:8px;color:#888;padding:0 12mm;
           font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;
           display:flex;justify-content:space-between;
           direction:${o.lang === 'ar' ? 'rtl' : 'ltr'}">
           <span>The EPMO</span>
           <span><span class="pageNumber"></span> / <span class="totalPages"></span></span>
         </div>`,
    });
    return Buffer.from(pdf);
  } finally {
    await ctx.close().catch(() => {});
  }
}

export function pdfUnavailableReason(e: unknown): string {
  const m = (e as Error)?.message ?? '';
  if (/executable doesn't exist|Failed to launch|ENOENT/i.test(m)) {
    return 'PDF generation needs Chromium, which is not installed in this container.';
  }
  return `Could not render the PDF: ${m.split('\n')[0]}`;
}

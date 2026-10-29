import './globals.css';
import type { Metadata } from 'next';
import { getLang } from '@/lib/i18n';

export const metadata: Metadata = {
  title: 'The EPMO | المكتب التنفيذي لإدارة المشاريع',
  description: 'The EPMO — Bilingual enterprise project, program, portfolio and governance management platform | المكتب التنفيذي لإدارة المشاريع',
  icons: { icon: '/favicon.svg' },
  // A private workspace: keep it out of search results.
  robots: { index: false, follow: false },
};

/**
 * Root layout stays bare so /login can render without the app shell.
 *
 * `dir` and `lang` belong on <html>, not on an inner div. Putting them on the
 * shell mirrored the layout but left the document declaring itself English
 * and left-to-right — which meant every `html[dir='rtl']` rule in the
 * stylesheet silently never matched, and assistive technology was told the
 * wrong language for the whole page.
 */
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const ar = (await getLang()) === 'ar';
  return (
    <html lang={ar ? 'ar' : 'en'} dir={ar ? 'rtl' : 'ltr'} suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@400;500&family=Noto+Kufi+Arabic:wght@400;500;700&display=swap" />
        {/* Applied before first paint so a chosen light theme never flashes dark.
            Dark is the bare :root, so it is the absence of the attribute. */}
        <script dangerouslySetInnerHTML={{ __html:
          `try{if(localStorage.getItem('pmo-theme-v2')==='light')document.documentElement.setAttribute('data-theme','light')}catch(e){}` }} />
      </head>
      <body>{children}</body>
    </html>
  );
}

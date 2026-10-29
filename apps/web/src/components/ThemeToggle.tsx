'use client';
import { useEffect, useState } from 'react';

type Mode = 'dark' | 'light';

/*
 * Version the key rather than read the old one. Anyone who had ever touched
 * the previous control had a preference saved under `pmo-theme`, which kept
 * handing them an appearance they had not recently chosen.
 */
const KEY = 'pmo-theme-v2';

/**
 * Both choices on screen, the current one marked.
 *
 * This was a single unlabelled icon cycling through system, light and dark.
 * The glyph showed the mode you were in rather than what pressing it would do,
 * and "system" resolved to dark anyway now the stylesheet commits to a look —
 * so the control had three positions, one of them a duplicate, and no way to
 * tell which you were on without pressing it. It was reported, fairly, as the
 * light theme having gone missing.
 */
export function ThemeToggle({ lang = 'en' }: { lang?: 'en' | 'ar' }) {
  const [mode, setMode] = useState<Mode>('dark');

  useEffect(() => {
    let saved: string | null = null;
    try { saved = localStorage.getItem(KEY); } catch { /* private window */ }
    const m: Mode = saved === 'light' ? 'light' : 'dark';
    setMode(m);
    apply(m);
  }, []);

  /** Dark is the bare :root, so it is the absence of the attribute. */
  function apply(m: Mode) {
    const root = document.documentElement;
    if (m === 'dark') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', 'light');
  }

  function choose(m: Mode) {
    setMode(m);
    try { localStorage.setItem(KEY, m); } catch { /* ignore */ }
    apply(m);
  }

  const t = (en: string, ar: string) => (lang === 'ar' ? ar : en);

  return (
    <div className="themeswitch" role="group" aria-label={t('Appearance', 'المظهر')}>
      <button type="button" onClick={() => choose('dark')}
              aria-pressed={mode === 'dark'} title={t('Dark', 'داكن')}>
        <svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path d="M10 2a8 8 0 108 8 6 6 0 01-8-8z" />
        </svg>
        <span>{t('Dark', 'داكن')}</span>
      </button>
      <button type="button" onClick={() => choose('light')}
              aria-pressed={mode === 'light'} title={t('Light', 'فاتح')}>
        <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor"
             strokeWidth="1.7" aria-hidden="true">
          <circle cx="10" cy="10" r="3.6" />
          <path d="M10 1.8v2M10 16.2v2M1.8 10h2M16.2 10h2M4.2 4.2l1.4 1.4M14.4 14.4l1.4 1.4M15.8 4.2l-1.4 1.4M5.6 14.4l-1.4 1.4"
                strokeLinecap="round" />
        </svg>
        <span>{t('Light', 'فاتح')}</span>
      </button>
    </div>
  );
}

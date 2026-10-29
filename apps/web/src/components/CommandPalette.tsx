'use client';
import { translator, type Lang } from '@/lib/i18n-dict';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Route } from 'next';

export type Cmd = { label: string; href: string; group: string };

export function CommandPalette({ commands, lang }: { commands: Cmd[]; lang?: Lang }) {
  const t = translator(lang ?? 'en');
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [i, setI] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault(); setOpen((v) => !v);
      } else if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => { if (open) { setQ(''); setI(0); requestAnimationFrame(() => input.current?.focus()); } }, [open]);

  const hits = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return commands;
    return commands.filter((c) =>
      c.label.toLowerCase().includes(s) || c.group.toLowerCase().includes(s));
  }, [q, commands]);

  useEffect(() => { if (i >= hits.length) setI(0); }, [hits.length, i]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setI((v) => Math.min(v + 1, hits.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setI((v) => Math.max(v - 1, 0)); }
    else if (e.key === 'Enter' && hits[i]) { e.preventDefault(); setOpen(false); router.push(hits[i].href as Route); }
  }

  return (
    <>
      <button className="kbtn" onClick={() => setOpen(true)} aria-label={t('Search — command palette')} aria-expanded={open}>
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
          <circle cx="7" cy="7" r="4.3" /><path d="M10.3 10.3L14 14" strokeLinecap="round" />
        </svg>
        {t('Search')}
        <kbd>⌘K</kbd>
      </button>

      {open && (
        <div className="cmdk-backdrop" onClick={() => setOpen(false)}>
          <div className="cmdk" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={t('Command palette')}>
            <input ref={input} value={q} placeholder={t('Jump to a module…')}
                   onChange={(e) => { setQ(e.target.value); setI(0); }} onKeyDown={onKeyDown}
                   aria-label={t('Search')} dir="auto" />
            {hits.length === 0 ? <div className="none">{t('Nothing matches')} “{q}”.</div> : (
              <ul>
                {hits.map((c, n) => (
                  <li key={c.href} data-active={n === i} onMouseEnter={() => setI(n)}>
                    <a href={c.href} onClick={() => setOpen(false)}>
                      {c.label}<small>{c.group}</small>
                    </a>
                  </li>
                ))}
              </ul>
            )}
            <footer><span><kbd>↑↓</kbd> {t('move')}</span><span><kbd>↵</kbd> {t('open')}</span><span><kbd>esc</kbd> {t('close')}</span></footer>
          </div>
        </div>
      )}
    </>
  );
}

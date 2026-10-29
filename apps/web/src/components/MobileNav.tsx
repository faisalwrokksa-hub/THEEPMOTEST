'use client';
import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { translator } from '@/lib/i18n-dict';

/** Small-screen rail. A link selection or Escape closes it; focus returns to the trigger. */
export function MobileNav({ children, ar = false }: { children: React.ReactNode; ar?: boolean }) {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  const previousPath = useRef(path);
  const trigger = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const t = translator(ar ? 'ar' : 'en');

  function close(restoreFocus = true) {
    setOpen(false);
    if (restoreFocus) trigger.current?.focus();
  }

  useEffect(() => {
    if (previousPath.current !== path) {
      previousPath.current = path;
      setOpen(false);
    }
  }, [path]);

  useEffect(() => {
    if (!open) return;
    closeButton.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); close(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      <button type="button" ref={trigger} className="iconbtn burger"
              onClick={() => setOpen(true)} aria-expanded={open}
              aria-controls="mobile-navigation" aria-label={t('Open navigation')}>
        <svg width="15" height="15" viewBox="0 0 16 16" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
          <path d="M2 4h12M2 8h12M2 12h12" strokeLinecap="round" />
        </svg>
      </button>
      {open && (
        <div className="drawer-backdrop" onClick={() => close()}>
          <nav id="mobile-navigation" className="rail drawer"
               onClick={(e) => {
                 e.stopPropagation();
                 if ((e.target as HTMLElement).closest('a[href]')) close(false);
               }}
               aria-label={t('Modules')}>
            <button type="button" ref={closeButton} className="drawer-close"
                    onClick={() => close()} aria-label={t('Close navigation')}>
              <span aria-hidden="true">×</span> {t('Close')}
            </button>
            {children}
          </nav>
        </div>
      )}
    </>
  );
}

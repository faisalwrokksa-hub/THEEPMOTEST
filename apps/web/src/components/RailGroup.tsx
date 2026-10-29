'use client';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

/**
 * A collapsible section of the navigation.
 *
 * Twenty-seven destinations in one list is a wall to scan, and most of the
 * time a reader is working inside one area. So a group opens when it holds
 * the page you are on, and otherwise stays shut until you ask for it.
 *
 * The group containing the current page is expanded on the server too, via the
 * `open` attribute, so the rail is correct in the HTML before any JavaScript
 * runs and does not visibly snap open after load.
 */
export function RailGroup({ label, hrefs, children }:
  { label: string; hrefs: string[]; children: React.ReactNode }) {
  const path = usePathname();
  const holdsCurrent = hrefs.some((h) => (h === '/' ? path === '/' : path.startsWith(h)));
  const [open, setOpen] = useState(holdsCurrent);

  // A choice to keep a group open survives navigation; the group holding the
  // current page always opens regardless, because hiding where you are is
  // never what someone meant.
  useEffect(() => {
    let saved: string | null = null;
    try { saved = localStorage.getItem(`pmo-rail:${label}`); } catch { /* private window */ }
    setOpen(holdsCurrent || saved === 'open');
  }, [label, holdsCurrent]);

  function toggle(e: React.MouseEvent<HTMLElement>) {
    e.preventDefault();
    const next = !open;
    setOpen(next);
    try { localStorage.setItem(`pmo-rail:${label}`, next ? 'open' : 'shut'); } catch { /* ignore */ }
  }

  return (
    <details className="rail-sec" open={open}>
      <summary className="rail-group" onClick={toggle}>
        <span>{label}</span>
        <svg className="chev" width="12" height="12" viewBox="0 0 16 16" fill="none"
             stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"
             strokeLinejoin="round" aria-hidden="true">
          <path d="M6 4l4 4-4 4" />
        </svg>
      </summary>
      <div className="rail-items">{children}</div>
    </details>
  );
}

'use client';
import { useEffect, useState } from 'react';

/**
 * Collapses the rail to icons.
 *
 * A Gantt or a wide table wants the 244px back, and a user who knows the
 * product does not need to read "Portfolios" every time. The choice is per
 * person and sticky, because a rail that reopens on every navigation is worse
 * than one that never collapses.
 */
export function RailToggle() {
  const [narrow, setNarrow] = useState(false);

  useEffect(() => {
    const v = (() => { try { return localStorage.getItem('pmo-rail') === 'narrow'; } catch { return false; } })();
    setNarrow(v);
    document.documentElement.classList.toggle('rail-narrow', v);
  }, []);

  function flip() {
    const v = !narrow;
    setNarrow(v);
    document.documentElement.classList.toggle('rail-narrow', v);
    try { localStorage.setItem('pmo-rail', v ? 'narrow' : 'wide'); } catch { /* private mode */ }
  }

  return (
    <button className="railtoggle" onClick={flip} aria-pressed={narrow}
            title={narrow ? 'Expand the menu' : 'Collapse the menu'}
            aria-label={narrow ? 'Expand the menu' : 'Collapse the menu'}>
      <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor"
           strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="2" y="2.6" width="12" height="10.8" rx="1.8" />
        <path d="M6.4 2.6v10.8" />
      </svg>
    </button>
  );
}

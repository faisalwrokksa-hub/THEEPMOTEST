'use client';
import { translator, type Lang } from '@/lib/i18n-dict';
import { useState } from 'react';
import { usePathname } from 'next/navigation';

export type SignedInSession = {
  userId: string; email: string; displayName: string;
  tenantId: string; tenantName: string; role: string; capabilities: string[];
  tenants: { tenantId: string; name: string; slug: string; role: string }[];
};

/**
 * Account menu. Both actions are plain form POSTs to route handlers rather
 * than Server Actions — stable URLs, no generated ids to go stale, and they
 * still work if the client bundle fails to load.
 */
export function TenantSwitcher({ session, lang }: {session: SignedInSession; lang?: Lang }) {
  const tx = translator(lang ?? 'en');
  const [open, setOpen] = useState(false);
  const path = usePathname();
  const initials = session.displayName.split(' ').map((s) => s[0]).slice(0, 2).join('');

  return (
    <div className="switcher">
      <button className="orgchip" onClick={() => setOpen((v) => !v)}
              aria-expanded={open} aria-haspopup="menu">
        <span className="av sm">{initials}</span>
        <span className="who">
          <b dir="auto">{session.tenantName}</b>
          <em><bdi>{session.displayName}</bdi> · {tx(session.role.replace(/_/g, ' '))}</em>
        </span>
        <svg className="caret" viewBox="0 0 12 12" width="10" height="10" aria-hidden="true">
          <path d="M2 4.5L6 8.5l4-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </button>

      {open && (
        <>
          <div className="sheet-backdrop" onClick={() => setOpen(false)} />
          <div className="sheet" role="menu">
            <header>{session.email}<small>{new Intl.NumberFormat(lang === 'ar' ? 'ar-SA' : 'en-US').format(session.capabilities.length)} {tx('capabilities')}</small></header>
            <section>
              <h4>{tx(session.tenants.length > 1 ? 'Switch workspace' : 'Workspace')}</h4>
              {session.tenants.map((t) => {
                const current = t.tenantId === session.tenantId;
                return current ? (
                  <div className="ident on" key={t.tenantId}>
                    <span className="av">{t.name.slice(0, 2).toUpperCase()}</span>
                    <span className="nm"><b dir="auto">{t.name}</b><em>{tx(t.role.replace(/_/g, ' '))}</em></span>
                    <span className="tick">{tx('current')}</span>
                  </div>
                ) : (
                  <form method="post" action="/api/session/tenant" key={t.tenantId}>
                    <input type="hidden" name="tenantId" value={t.tenantId} />
                    <input type="hidden" name="returnTo" value={path} />
                    <button className="ident" type="submit" role="menuitem">
                      <span className="av">{t.name.slice(0, 2).toUpperCase()}</span>
                      <span className="nm"><b dir="auto">{t.name}</b><em>{tx(t.role.replace(/_/g, ' '))}</em></span>
                    </button>
                  </form>
                );
              })}
            </section>
            <section>
              <form method="post" action="/api/session/logout-all">
                <button className="ident danger" type="submit" role="menuitem">
                  <span className="av" aria-hidden="true">⏻</span>
                  <span className="nm"><b>{tx('Sign out all devices')}</b><em>{tx('revoke every active session')}</em></span>
                </button>
              </form>
              <form method="post" action="/api/session/logout">
                <button className="ident danger" type="submit" role="menuitem">
                  <span className="av">⏻</span>
                  <span className="nm"><b>{tx('Sign out')}</b><em>{tx('end this session')}</em></span>
                </button>
              </form>
            </section>
          </div>
        </>
      )}
    </div>
  );
}

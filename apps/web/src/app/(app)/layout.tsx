import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { getLayoutSession, api, SESSION_COOKIE } from '@/lib/api';
import { NAV } from '@/lib/nav';
import { can, NAV_MODULE, type Capability } from '@pmo/contracts';
import { TenantSwitcher } from '@/components/TenantSwitcher';
import { LangToggle } from '@/components/LangToggle';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Cursor } from '@/components/Cursor';
import { AskWidget } from '@/components/AskWidget';
import { RailToggle } from '@/components/RailToggle';
import { CommandPalette } from '@/components/CommandPalette';
import { NavLink } from '@/components/NavLink';
import { RailGroup } from '@/components/RailGroup';
import { Crumbs } from '@/components/Crumbs';
import { MobileNav } from '@/components/MobileNav';

/** Everything inside this group requires a signed-in session. */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getLayoutSession();
  const jar = await cookies();
  if (!session.authenticated) {
    if ('unavailable' in session && session.unavailable) {
      const ar = jar.get('pmo_lang')?.value === 'ar';
      return (
        <div className="authwrap" dir={ar ? 'rtl' : 'ltr'} lang={ar ? 'ar' : 'en'}>
          <section className="authpanel" role="alert">
            <h1>{ar ? 'تعذّر التحقق من الجلسة' : 'Session verification unavailable'}</h1>
            <p>{ar
              ? 'الخدمة غير متاحة مؤقتًا. لم يتم تسجيل خروجك. أعد المحاولة بعد قليل.'
              : 'The service is temporarily unavailable. You have not been signed out. Please retry shortly.'}</p>
            <a className="btn" href="/">{ar ? 'إعادة المحاولة' : 'Retry'}</a>
          </section>
        </div>
      );
    }
    /*
     * A cookie that is present but no longer resolves is an ended session,
     * not a first visit — almost always the idle window closing. Saying so
     * is the difference between "you were signed out after a while away" and
     * being dumped on a login screen for no visible reason.
     */
    const ended = Boolean(jar.get(SESSION_COOKIE));
    redirect(ended ? '/login?error=expired' : '/login');
  }

  const ar = jar.get('pmo_lang')?.value === 'ar';
  const caps = (session.capabilities ?? ['read']) as Capability[];

  // A screen appears only if the person has the capability AND the workspace
  // is licensed for the module that owns it. The API enforces the same rule,
  // so hiding the link is a convenience, not the control.
  let enabledModules: string[] = ['core360'];
  try { enabledModules = await api.enabledModules(); } catch { /* API down */ }
  const licensed = (key: string) => {
    const mod = NAV_MODULE[key];
    return !mod || mod === 'core360' || enabledModules.includes(mod);
  };

  const allowed = (i: { cap: Capability; key: string }) => can(caps, i.cap) && licensed(i.key);
  const groups = NAV
    .map((g) => ({ ...g, items: g.items.filter(allowed) }))
    .filter((g) => g.items.length > 0);
  const commands = groups.flatMap((g) => g.items.map((i) => ({
    label: ar ? i.ar : i.label, href: i.href, group: ar ? g.ar : g.label,
  }))); // show and search the group in the selected language too

  const rail = (
    <>
      {/* Their wordmark treatment: no icon, the second half in the brand mint. */}
      <div className="brand"><span className="wordmark">{ar ? 'المكتب التنفيذي لإدارة المشاريع' : 'The EPMO'}</span></div>
      <RailToggle />
      {groups.map((g) => (
        <RailGroup key={g.key} label={ar ? g.ar : g.label} hrefs={g.items.map((i) => i.href)}>
          {g.items.map((i) => (
            <NavLink key={i.href} href={i.href} navKey={i.key}>{ar ? i.ar : i.label}</NavLink>
          ))}
        </RailGroup>
      ))}
    </>
  );

  return (
    <div className="shell" dir={ar ? 'rtl' : 'ltr'} lang={ar ? 'ar' : 'en'}>
      <a className="skiplink" href="#main">{ar ? 'تخطَّ إلى المحتوى' : 'Skip to content'}</a>
      <nav className="rail" aria-label={ar ? 'الوحدات' : 'Modules'}>{rail}</nav>
      <div>
        <header className="topbar">
          <MobileNav ar={ar}>{rail}</MobileNav>
          <Crumbs ar={ar} />
          <div className="spacer" />
          <CommandPalette commands={commands} lang={ar ? 'ar' : 'en'} />
          <LangToggle ar={ar} />
          <ThemeToggle lang={ar ? 'ar' : 'en'} />
          <TenantSwitcher session={session} lang={ar ? 'ar' : 'en'} />
        </header>
        <main id="main" tabIndex={-1}><div className="page">{children}</div></main>
        <Cursor />
        <AskWidget lang={ar ? 'ar' : 'en'} enabled={enabledModules.includes('ai360') && can(caps, 'pmoa_view_financials')} />
      </div>
    </div>
  );
}

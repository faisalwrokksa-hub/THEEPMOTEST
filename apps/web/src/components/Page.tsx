import { getLang, tr } from '@/lib/i18n';
/**
 * Every screen's heading goes through here, so translating the shell
 * translates 26 titles and subtitles without touching 26 files. Pages keep
 * passing English — that is the key the dictionary is looked up by.
 */
export async function Page({ title, sub, children }:
  { title: string; sub?: string; children?: React.ReactNode }) {
  const t = await tr();
  return (
    <>
      <h1>{t(title)}</h1>
      {sub && <p className="sub">{t(sub)}</p>}
      {children}
    </>
  );
}

export async function Loaded<T>({ load, children, empty }:
  { load: () => Promise<T>; children: (d: T) => React.ReactNode; empty?: string }) {
  const t = await tr();
  const ar = (await getLang()) === 'ar';
  let data: T;
  try { data = await load(); }
  catch (e) {
    const err = e as { status?: number; detail?: string; message: string; isNotLicensed?: boolean };
    // A module this workspace has not licensed is a normal state, not a fault.
    if (err.isNotLicensed || (err.status === 403 && /not enabled|subscription expired/i.test(err.detail ?? ''))) {
      return (
        <div className="panel locked">
          <span className="tag">{t('Not included in your plan')}</span>
          <h2 style={{ fontSize: 'var(--fs-lg)', margin: '14px 0 8px' }}>{t('This module is not enabled')}</h2>
          <p className="dim" style={{ maxWidth: '60ch' }}>{err.detail}</p>
          <p className="dim" style={{ maxWidth: '60ch' }}>
            {t('The EPMO is licensed per module. An administrator can turn this on from')}{' '}
            <a href="/platform">{t('Platform & Modules')}</a>.
          </p>
        </div>
      );
    }
    if (err.status === 403) {
      return (
        <div className="panel locked">
          <span className="tag">{t('Not permitted')}</span>
          <h2 style={{ fontSize: 'var(--fs-lg)', margin: '14px 0 8px' }}>{t('Your role cannot open this')}</h2>
          <p className="dim">{err.detail}</p>
        </div>
      );
    }
    // An expired session is recoverable through sign-in, not a server outage.
    if (err.status === 401) {
      return (
        <div className="panel locked" role="alert">
          <strong>{ar ? 'انتهت جلسة تسجيل الدخول.' : 'Your session has expired.'}</strong>
          <p className="dim">{ar ? 'سجّل الدخول مجددًا للمتابعة.' : 'Please sign in again to continue.'}</p>
          <a href="/login">{ar ? 'تسجيل الدخول' : 'Sign in'}</a>
        </div>
      );
    }
    // Never display raw API exceptions or developer commands to customers.
    return (
      <div className="err" role="alert">
        <strong>{ar ? 'تعذّر تحميل الصفحة.' : 'This page could not load.'}</strong>{' '}
        {ar
          ? 'حدّث الصفحة، وإذا استمرت المشكلة فتواصل مع الدعم.'
          : 'Refresh the page. If the problem continues, contact support.'}
      </div>
    );
  }
  if (Array.isArray(data) && data.length === 0) {
    return <div className="panel">{t(empty ?? 'Nothing here yet.')}</div>;
  }
  return <>{children(data)}</>;
}

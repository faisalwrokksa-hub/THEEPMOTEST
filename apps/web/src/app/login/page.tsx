import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getSession } from '@/lib/api';
import { getLang } from '@/lib/i18n';

export const metadata = { title: 'Sign in · The EPMO' };

export default async function LoginPage({ searchParams }:
  { searchParams: Promise<{ error?: string }> }) {
  const s = await getSession();
  if (s.authenticated) redirect('/');

  const { error } = await searchParams;
  const ar = (await getLang()) === 'ar';
  // Never display arbitrary URL parameters or backend-provided error text.
  const loginErrors = {
    missing: { en: 'Enter your username and password.', ar: 'أدخل اسم المستخدم وكلمة المرور.' },
    invalid: { en: 'Those credentials are not recognised.', ar: 'اسم المستخدم أو كلمة المرور غير صحيح.' },
    unavailable: { en: 'Sign-in is temporarily unavailable. Please try again shortly.', ar: 'تسجيل الدخول غير متاح مؤقتًا. يرجى المحاولة بعد قليل.' },
    rate_limited: { en: 'Too many attempts. Please wait before trying again.', ar: 'محاولات كثيرة. يرجى الانتظار قبل إعادة المحاولة.' },
    session_missing: { en: 'We could not start your session. Please try again.', ar: 'تعذّر بدء الجلسة. يرجى المحاولة مجددًا.' },
    expired: { en: 'Your session expired. Please sign in again.', ar: 'انتهت جلستك. يرجى تسجيل الدخول مجددًا.' },
  } as const;
  const safeError = error
    ? (Object.prototype.hasOwnProperty.call(loginErrors, error)
        ? loginErrors[error as keyof typeof loginErrors] : loginErrors.invalid)
    : null;
  const showHint = process.env.NODE_ENV === 'development' &&
    (!process.env.DEPLOYMENT_ENV || process.env.DEPLOYMENT_ENV === 'development');

  return (
    <div className="authwrap">
      <div className="authpanel">
        <div className="brand" style={{ padding: 0, marginBlockEnd: 26 }}>
          <span className="glyph">E</span><span className="wordmark">{ar ? 'المكتب التنفيذي لإدارة المشاريع' : 'The EPMO'}</span>
        </div>
        <h1>{ar ? 'تسجيل الدخول' : 'Sign in'}</h1>
        <p className="sub" style={{ marginBlockEnd: 22 }}>
          {ar ? 'حوكمة المحافظ والبرامج والمشاريع.' : 'Governance for portfolios, programmes and projects.'}
        </p>

        {/* A plain POST: works without JavaScript and cannot go stale. */}
        <form className="authform" method="post" action="/api/session">
          <label>
            {ar ? 'اسم المستخدم أو البريد الإلكتروني' : 'Username or email'}
            <input name="identifier" type="text" autoComplete="username" required autoFocus aria-invalid={Boolean(safeError)} aria-describedby={safeError ? "login-error" : undefined}
                   placeholder={ar ? 'اسم المستخدم أو you@company.com' : 'username or you@company.com'} />
          </label>
          <label>
            {ar ? 'كلمة المرور' : 'Password'}
            <input name="password" type="password" autoComplete="current-password" required aria-invalid={Boolean(safeError)} aria-describedby={safeError ? "login-error" : undefined}
                   placeholder="••••••••" />
          </label>
          {safeError && <p id="login-error" className="formerr" role="alert">{ar ? safeError.ar : safeError.en}</p>}
          <button className="btn wide" type="submit">{ar ? 'تسجيل الدخول' : 'Sign in'}</button>
          <Link href="/forgot-password">{ar ? 'نسيت كلمة المرور؟' : 'Forgot password?'}</Link>
        </form>

        {showHint && (
          <div className="hint">
            <strong>{ar ? 'حسابات التطوير' : 'Development accounts'}</strong>
            <table>
              <tbody>
                <tr><td><code>ankit_aetherix</code></td><td>{ar ? 'مالك · مساحتا العمل' : 'owner · both workspaces'}</td></tr>
                <tr><td><code>fatima@al-nakheel.test</code></td><td>{ar ? 'مالك · النخيل' : 'owner · Al-Nakheel'}</td></tr>
                <tr><td><code>pm@pmoalign.test</code></td><td>{ar ? 'مستشار · النخيل' : 'consultant · Al-Nakheel'}</td></tr>
                <tr><td><code>khalid@nexa.test</code></td><td>{ar ? 'مالك · نكسا' : 'owner · Nexa'}</td></tr>
              </tbody>
            </table>
            <p>{ar ? 'تستخدم الحسابات التجريبية كلمة المرور ' : 'The seeded accounts use '}<code dir="ltr">pmoalign-dev</code>{ar
              ? '، بينما يحتفظ حساب المالك بكلمة مرور مستقلة لا تُعرض هنا ولا تتغير عند إعادة تهيئة البيانات.'
              : '. The owner account keeps its own password — it is never printed here and a reseed does not reset it.'}</p>
          </div>
        )}
      </div>
      <aside className="authside">
        <blockquote>
          {ar
            ? '«لا يمكن للمشروع تجاوز بوابة حوكمة، ولا اتخاذ قرار دون مسؤول، ولا ترك تقرير دون تحديث؛ فالمنصة تضمن ذلك.»'
            : '“A project cannot skip a gate, a decision cannot lack an owner, and a report cannot go stale — because the platform will not allow it.”'}
        </blockquote>
      </aside>
    </div>
  );
}

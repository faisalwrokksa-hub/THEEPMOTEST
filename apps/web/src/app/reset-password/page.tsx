import { getLang } from '@/lib/i18n';
import { ResetPasswordForm } from './ResetPasswordForm';
// The bearer token lives in a URL fragment, not server logs, and must never
// be shared in a Referer header even if a future page adds external resources.
export const metadata = { title: 'Reset password | The EPMO', robots: { index: false },
  other: { referrer: 'no-referrer' } };
export default async function ResetPasswordPage() {
  const lang = await getLang();
  return <main className="authwrap" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
    <section className="authpanel" style={{ maxWidth: 510 }}>
      <h1>{lang === 'ar' ? 'تعيين كلمة مرور جديدة' : 'Choose a new password'}</h1>
      <ResetPasswordForm lang={lang} />
    </section>
  </main>;
}

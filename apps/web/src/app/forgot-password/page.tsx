import Link from 'next/link';
import { getLang } from '@/lib/i18n';
import { RecoveryRequestForm } from './RecoveryRequestForm';
export const metadata = { title: 'Password recovery | The EPMO', robots: { index: false } };
export default async function ForgotPasswordPage() {
  const lang = await getLang();
  return <main className="authwrap" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
    <section className="authpanel" style={{ maxWidth: 510 }}>
      <h1>{lang === 'ar' ? 'استعادة كلمة المرور' : 'Forgot your password?'}</h1>
      <p>{lang === 'ar' ? 'سنرسل رابطًا صالحًا لمدة 30 دقيقة إذا كان لديك حساب نشط.' : 'We will email a 30-minute recovery link if an active account exists.'}</p>
      <RecoveryRequestForm lang={lang} />
      <p><Link href="/login">{lang === 'ar' ? 'العودة إلى تسجيل الدخول' : 'Back to sign in'}</Link></p>
    </section>
  </main>;
}

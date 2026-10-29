import { getLang } from '@/lib/i18n';
import { InviteForm } from './InviteForm';
export const metadata = { title: 'Accept Invitation | The EPMO', other: { referrer: 'no-referrer' } };
export default async function AcceptInvitePage() {
  const lang = await getLang();
  return <main style={{ maxWidth: 580, margin: '10vh auto', padding: 24 }} dir={lang === 'ar' ? 'rtl' : 'ltr'}>
    <h1>{lang === 'ar' ? 'الانضمام إلى The EPMO' : 'Join The EPMO'}</h1>
    <InviteForm lang={lang} />
  </main>;
}

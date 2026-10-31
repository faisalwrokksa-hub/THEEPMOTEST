import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getSession, api } from '@/lib/api';
import { getLang } from '@/lib/i18n';
import { Page } from '@/components/Page';
import { DeploymentPlanner } from '@/components/DeploymentPlanner';

export default async function DeploymentPlanningPage() {
  const session = await getSession();
  if (!session.authenticated) redirect('/login');
  if (!session.capabilities.includes('pmoa_admin')) redirect('/');
  const ar = (await getLang()) === 'ar';
  const profile = await api.workspaceProfile();
  return <Page title={ar ? 'تخطيط الاستضافة' : 'Deployment planning'}
    sub={ar ? 'اختر متطلبات الاستضافة للمراجعة الإدارية دون تفعيل أي بيئة.' : 'Prepare a deployment preference for administrator review without activating an environment.'}>
    <section className="panel" style={{marginBlockEnd:16}}>
      <h2>{ar ? 'حالة الاستضافة' : 'Deployment status'}</h2>
      <p role="status">{ar ? 'لم يتم التحقق من حالة الاستضافة من واجهة برمجة تطبيقات موثوقة.' : 'Deployment status is unavailable until a trusted authenticated API contract is available.'}</p>
      <p className="dim">{ar ? 'لا يمكن للعميل اعتماد الامتثال أو الإقامة الفعلية للبيانات.' : 'Customers cannot certify compliance or actual data residency.'}</p>
      <Link href="/settings">{ar ? 'العودة للإعدادات' : 'Back to settings'}</Link>
    </section>
    <DeploymentPlanner workspace={profile.slug} lang={ar ? 'ar' : 'en'} />
  </Page>;
}

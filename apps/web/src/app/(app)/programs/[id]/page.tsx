import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { api, getSession } from '@/lib/api';
import { can, type Capability, type Program } from '@pmo/contracts';
import { Page } from '@/components/Page';
import { getLang } from '@/lib/i18n';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Program details are resolved exclusively through tenant-authenticated APIs. */
export default async function ProgramDetails({ params }: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const session = await getSession();
  if (!session.authenticated) redirect('/login');
  const caps = session.capabilities as Capability[];
  if (!can(caps, 'pmoa_view_portfolio')) notFound();
  const [modules, programs, portfolios, projects] = await Promise.all([
    api.enabledModules(),
    api.programs(),
    api.portfolios(),
    api.projects(id),
  ]);
  if (!modules.includes('pmo360')) notFound();
  const program = (programs as Program[]).find(p => p.id === id);
  if (!program) notFound(); // Never show a record outside the current tenant.
  const portfolio = portfolios.find(p => p.id === program.portfolioId);
  if (!portfolio) notFound(); // Guard against orphaned or foreign portfolio rows.
  const ar = (await getLang()) === 'ar';
  const healthLabel = (value: string) => value.replace(/_/g, ' ');
  return <Page title={program.name}
    sub={ar ? 'تفاصيل البرنامج والمشاريع المرتبطة به' : 'Programme overview and linked projects'}>
    <section className="panel" style={{ marginBlockEnd: 18 }}>
      <p><Link href="/programs">{ar ? 'العودة إلى البرامج' : 'Back to Programs'}</Link></p>
      <h2>{ar ? 'معلومات البرنامج' : 'Programme details'}</h2>
      <p>{ar ? 'المحفظة' : 'Portfolio'}: <strong>{portfolio.name}</strong></p>
      <p>{ar ? 'الحالة' : 'Health'}: <span className={`pill ${program.health}`}>{healthLabel(program.health)}</span></p>
      {program.description && <p>{program.description}</p>}
    </section>
    <section className="panel">
      <h2>{ar ? 'المشاريع المرتبطة' : 'Linked projects'} ({projects.items.length}{projects.nextCursor ? '+' : ''})</h2>
      {projects.items.length === 0
        ? <p className="dim">{ar ? 'لا توجد مشاريع مرتبطة بهذا البرنامج.' : 'No projects are linked to this programme.'}</p>
        : <div style={{ overflowX: 'auto' }}><table>
          <thead><tr><th>{ar ? 'المشروع' : 'Project'}</th><th>{ar ? 'الحالة' : 'Health'}</th></tr></thead>
          <tbody>{projects.items.map(project => <tr key={project.id}>
            <td><Link href={`/projects?program=${encodeURIComponent(program.id)}`}>{project.name}</Link></td>
            <td><span className={`pill ${project.health}`}>{healthLabel(project.health)}</span></td>
          </tr>)}</tbody>
        </table></div>}
      {projects.nextCursor && <p className="dim">{ar
        ? 'تُعرض أول 50 مشروعاً كحد أقصى هنا. افتح قائمة المشاريع للاطلاع على الصفحات التالية.'
        : 'Showing up to the first 50 linked projects. Open the project list to see additional pages.'}</p>}
      <p><Link href={`/projects?program=${encodeURIComponent(program.id)}`}>
        {ar ? 'عرض جميع مشاريع البرنامج' : 'View all programme projects'}
      </Link></p>
      {can(caps, 'pmoa_manage_projects') && <p>
        <Link href={`/projects?new=project&program=${encodeURIComponent(program.id)}`}>
          {ar ? 'إنشاء مشروع داخل البرنامج' : 'Create a project in this programme'}
        </Link>
      </p>}
    </section>
  </Page>;
}

import Link from 'next/link';
import { api, getSession } from '@/lib/api';
import { can, type Capability, type Program } from '@pmo/contracts';
import { Page, Loaded } from '@/components/Page';
import { NewRecord, Flash } from '@/components/NewRecord';
import { getLang } from '@/lib/i18n';
import { selectedPortfolioId, programsForPortfolio } from '@/lib/programs-filter';

/** Tenant-scoped programme workspace using the existing create API. */
export default async function ProgramsPage({ searchParams }: {
  searchParams: Promise<{ error?: string; done?: string; new?: string; portfolio?: string }>;
}) {
  const { error, done, new: openForm, portfolio } = await searchParams;
  const lang = await getLang();
  const session = await getSession();
  const caps = (session.authenticated ? session.capabilities : []) as Capability[];
  const modules = await api.enabledModules().catch(() => ['core360']);
  const mayCreate = can(caps, 'pmoa_manage_projects') && modules.includes('pmo360');
  return <Page title={lang === 'ar' ? 'البرامج' : 'Programs'}
    sub={lang === 'ar' ? 'نظّم المشاريع المترابطة ضمن برامج ومحافظ.' : 'Organize related projects by programme and portfolio.'}>
    <Flash error={error} done={done} lang={lang} />
    <Loaded load={async () => {
      const [portfolios, programs] = await Promise.all([api.portfolios(), api.programs()]);
      const chosen = selectedPortfolioId(portfolio, portfolios);
      return { portfolios, programs: programsForPortfolio(programs as Program[], chosen), chosen };
    }}>
      {({ portfolios, programs, chosen }) => <>
        {portfolios.length === 0 && <section className="panel">
          <p>{lang === 'ar' ? 'أنشئ محفظة أولاً لإضافة برنامج.' : 'Create a portfolio before adding a programme.'}</p>
          <Link href="/portfolios?new=portfolio">{lang === 'ar' ? 'إنشاء محفظة' : 'Create portfolio'}</Link>
        </section>}
        {portfolios.length > 1 && <form method="get" action="/programs" style={{ marginBlockEnd: 18, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <label htmlFor="portfolio-filter">{lang === 'ar' ? 'تصفية حسب المحفظة' : 'Filter by portfolio'}</label>
          <select id="portfolio-filter" name="portfolio" defaultValue={chosen ?? ''}>
            <option value="">{lang === 'ar' ? 'جميع المحافظ' : 'All portfolios'}</option>
            {portfolios.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <button type="submit">{lang === 'ar' ? 'تطبيق' : 'Apply'}</button>
          {chosen && <Link href="/programs">{lang === 'ar' ? 'مسح التصفية' : 'Clear filter'}</Link>}
        </form>}
        {chosen === null && <p role="alert" className="dim">{lang === 'ar' ? 'المحفظة المحددة غير متاحة.' : 'The selected portfolio is unavailable.'}</p>}
        {mayCreate && portfolios.length > 0 && <div style={{ marginBlockEnd: 18 }}>
          <NewRecord kind="program" lang={lang} title="New programme" returnTo="/programs"
            initialOpen={openForm === 'program'} intro="A programme groups related projects inside one portfolio."
            fields={[
              { name: 'portfolioId', label: 'Portfolio', type: 'select', required: true,
                options: portfolios.map(p => ({ value: p.id, label: p.name })),
                defaultValue: chosen ?? undefined },
              { name: 'name', label: 'Programme name', required: true, minLength: 2, maxLength: 200 },
              { name: 'description', label: 'Description', type: 'textarea', maxLength: 4000 },
            ]} />
        </div>}
        {!mayCreate && <p className="dim">{lang === 'ar'
          ? 'إنشاء البرامج يتطلب الصلاحية المناسبة وتفعيل وحدة إدارة المشاريع.'
          : 'Creating programmes requires project-management permission and an enabled PMO module.'}</p>}
        {programs.length === 0 ? <div className="empty"><strong>
          {lang === 'ar' ? 'لا توجد برامج بعد' : 'No programmes yet'}
        </strong></div> : <div style={{ overflowX: 'auto' }}><table>
          <thead><tr>
            <th>{lang === 'ar' ? 'البرنامج' : 'Programme'}</th>
            <th>{lang === 'ar' ? 'المحفظة' : 'Portfolio'}</th>
            <th>{lang === 'ar' ? 'الحالة' : 'Health'}</th>
            <th>{lang === 'ar' ? 'المشاريع' : 'Projects'}</th>
          </tr></thead>
          <tbody>{programs.map(program => <tr key={program.id}>
            <td><strong><Link href={`/programs/${encodeURIComponent(program.id)}`}>{program.name}</Link></strong>{program.description &&
              <div className="dim">{program.description}</div>}</td>
            <td>{portfolios.find(p => p.id === program.portfolioId)?.name ?? '—'}</td>
            <td><span className={`pill ${program.health}`}>{program.health.replace(/_/g, ' ')}</span></td>
            <td><Link href={`/projects?program=${encodeURIComponent(program.id)}`}>
              {lang === 'ar' ? 'عرض المشاريع' : 'View projects'}</Link>
              {mayCreate && <> · <Link href={`/projects?new=project&program=${encodeURIComponent(program.id)}`}>
                {lang === 'ar' ? 'إضافة مشروع' : 'Add project'}</Link></>}
            </td>
          </tr>)}</tbody>
        </table></div>}
      </>}
    </Loaded>
  </Page>;
}

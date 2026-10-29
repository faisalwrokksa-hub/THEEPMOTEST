import { api, getSession } from '@/lib/api';
import { can, type Capability } from '@pmo/contracts';
import Link from 'next/link';
import { Page, Loaded } from '@/components/Page';
import { NewRecord, Flash } from '@/components/NewRecord';
import { getLang, tr } from '@/lib/i18n';

export default async function PortfoliosPage({ searchParams }:
  { searchParams: Promise<{ error?: string; done?: string; new?: string }> }) {
  const { error, done, new: openForm } = await searchParams;
  const t = await tr();
  const lang = await getLang();
  const session = await getSession();
  const capabilities = (session.authenticated ? session.capabilities : []) as Capability[];
  const licensedModules = await api.enabledModules().catch(() => ['core360']);
  const mayCreate = can(capabilities, 'pmoa_manage_projects') && licensedModules.includes('pmo360');
  return (
    <Page title={lang === 'ar' ? 'المحافظ والبرامج' : 'Portfolios & Programs'}
          sub={lang === 'ar' ? 'نظّم المشاريع حسب الاستراتيجية والتمويل والإدارة.' : 'How projects are grouped for funding and management.'}>
      <Flash error={error} done={done} lang={lang} />
      <Loaded load={async () => ({ p: await api.portfolios(), g: await api.programs() })}>
        {({ p, g }) => (
          <>
            {p.length === 0 && <section className="panel" style={{ marginBottom: 16 }}>
              <h2 className="sec" style={{ marginTop: 0 }}>
                {lang === 'ar' ? 'ابدأ بمحفظتك الأولى' : 'Start with your first portfolio'}
              </h2>
              <p className="dim">{lang === 'ar'
                ? 'أنشئ محفظة للهدف الاستراتيجي، ثم أضف برنامجاً لربط المشاريع بها.'
                : 'Create a portfolio for your strategic objective, then a programme to group its projects.'}</p>
              <Link href="/getting-started">{lang === 'ar' ? 'دليل البدء' : 'View setup guide'}</Link>
            </section>}
            {p.length > 0 && g.length === 0 && <section className="panel" style={{ marginBottom: 16 }}>
              <strong>{lang === 'ar' ? 'الخطوة التالية: إنشاء برنامج' : 'Next: create a programme'}</strong>
              <p className="dim">{lang === 'ar'
                ? 'اختر المحفظة التي ينتمي إليها البرنامج، ثم أنشئ مشروعك الأول.'
                : 'Choose the portfolio the programme belongs to, then create your first project.'}</p>
            </section>}
            {mayCreate ? <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <NewRecord lang={lang} kind="portfolio" title="New portfolio" returnTo="/portfolios" initialOpen={openForm === 'portfolio' || (openForm === 'program' && p.length === 0)}
                intro="A portfolio is a pot of money and strategy that programmes and projects sit under."
                fields={[
                  { name: 'name', label: 'Portfolio name', required: true, minLength: 2, maxLength: 200, placeholder: '2026 Strategic Transformation' },
                  { name: 'health', label: 'Health', type: 'select', required: true, options: [
                    { value: 'on_track', label: 'On track' }, { value: 'at_risk', label: 'At risk' },
                    { value: 'critical', label: 'Critical' }] },
                  { name: 'description', label: 'Description', type: 'textarea' },
                ]} />
              {p.length > 0 && (
                <NewRecord lang={lang} kind="program" title="New programme" returnTo="/portfolios" initialOpen={openForm === 'program'}
                  intro="A programme groups related projects inside one portfolio."
                  fields={[
                    { name: 'portfolioId', label: 'Portfolio', type: 'select', required: true,
                      options: p.map((x: any) => ({ value: x.id, label: x.name })) },
                    { name: 'name', label: 'Programme name', required: true, minLength: 2, maxLength: 200, placeholder: 'Residential Delivery' },
                    { name: 'health', label: 'Health', type: 'select', required: true, options: [
                      { value: 'on_track', label: 'On track' }, { value: 'at_risk', label: 'At risk' },
                      { value: 'critical', label: 'Critical' }] },
                    { name: 'description', label: 'Description', type: 'textarea' },
                  ]} />
              )}
            </div> : <p className="dim">{lang === 'ar'
              ? 'إنشاء المحافظ والبرامج يتطلب الصلاحية المناسبة وتفعيل وحدة إدارة المشاريع.'
              : 'Creating portfolios and programmes requires project-management permission and an enabled PMO module.'}</p>}
            {p.length === 0 ? (
              <div className="empty"><strong>{t('No portfolios yet')}</strong>
                <p>{mayCreate
                  ? (lang === 'ar' ? 'ابدأ بإنشاء محفظة أعلاه، ثم أضف برنامجاً ومشاريع.' : 'Create your first portfolio above, then add a programme and projects.')
                  : (lang === 'ar' ? 'اطلب من مسؤول مخوّل إنشاء المحفظة الأولى.' : 'Ask an authorized administrator to create the first portfolio.')}</p></div>
            ) : (
            <table>
              <thead><tr><th>{t('Portfolio')}</th><th>{t('Health')}</th><th>{t('Programs')}</th></tr></thead>
              <tbody>
                {p.map((pf: any) => (
                  <tr key={pf.id}>
                    <td><strong>{pf.name}</strong>
                      {pf.description && <div className="dim">{pf.description}</div>}</td>
                    <td><span className={`pill ${pf.health}`}>{pf.health.replace('_', ' ')}</span></td>
                    <td>{g.filter((pg: any) => pg.portfolioId === pf.id).length ?
                      g.filter((pg: any) => pg.portfolioId === pf.id).map((pg: any) =>
                        <div key={pg.id}><Link href={`/projects?program=${encodeURIComponent(pg.id)}`}>
                          {pg.name}
                        </Link>{' '}{mayCreate && <Link href={`/projects?new=project&program=${encodeURIComponent(pg.id)}`}>
                          {lang === 'ar' ? 'إضافة مشروع' : 'Add project'}
                        </Link>}</div>) : <span className="dim">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>)}
          </>
        )}
      </Loaded>
    </Page>
  );
}

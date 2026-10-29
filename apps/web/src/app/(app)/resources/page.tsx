import { api } from '@/lib/api';
import { Page, Loaded } from '@/components/Page';
import { NewRecord, Flash } from '@/components/NewRecord';
import { num } from '@/lib/fmt';
import { tr, getLang } from '@/lib/i18n';

export default async function Resources({ searchParams }:
  { searchParams: Promise<{ error?: string; done?: string }> }) {
  const { error, done } = await searchParams;
  const lang = await getLang();
  const t = await tr();
  // Outside <Loaded> on purpose: the create form must render even when the
  // list below is empty, which is precisely when someone needs it.
  const o = await api.createOptions().catch(() => ({ projects: [], people: [] }));
  return (
    <Page title="Resources"
          sub="Who is working on what, and who is over-committed. Over-allocation is the earliest warning of slippage.">
      <Flash error={error} done={done} lang={lang} />
      <NewRecord lang={lang} kind="allocation" title="New allocation" cta="Allocate" returnTo="/resources"
        intro="Allocating the same person past 100% across projects is what over-commitment looks like before anyone feels it."
        fields={[
                { name: 'userId', label: 'Person', type: 'select', required: true,
                  options: o.people.map((p: any) => ({ value: p.id, label: p.name })) },
                { name: 'projectId', label: 'Project', type: 'select', required: true,
                  options: o.projects.map((p: any) => ({ value: p.id, label: `${p.code} — ${p.name}` })) },
                { name: 'role', label: 'Role', required: true, placeholder: 'Project Manager' },
                { name: 'allocationPct', label: 'Allocation %', type: 'number', required: true, min: 1, max: 100, step: 1, hint: '1–100' },
                { name: 'startDate', label: 'From', type: 'date' },
                { name: 'endDate', label: 'To', type: 'date' },
              ]} />
      <Loaded load={api.resources}>
        {(d) => (
          <>
            <h2 className="sec" style={{ marginTop: 0 }}>{t('Capacity')}</h2>
            <table>
              <thead><tr><th>{t('Person')}</th><th>{t('Projects')}</th><th>{t('Allocated')}</th><th>{t('Load')}</th><th>{t('Hours, 7 days')}</th></tr></thead>
              <tbody>
                {d.people.map((p: any) => {
                  const over = p.allocatedPct > 100;
                  return (
                    <tr key={p.id}>
                      <td><strong>{p.name}</strong></td>
                      <td className="num">{p.projects}</td>
                      <td className="num"><span className={over ? 'crit' : p.allocatedPct >= 90 ? 'warnt' : 'good'}>
                        {p.allocatedPct}%</span></td>
                      <td>
                        <div className="bar" style={{ inlineSize: 180 }}>
                          <i className={over ? 'over' : undefined}
                             style={{ width: `${Math.min(100, p.allocatedPct)}%` }} />
                        </div>
                        {over && <div className="crit">over-committed by {p.allocatedPct - 100}%</div>}
                      </td>
                      <td className="num">{num(p.hoursLast7, 1)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <h2 className="sec">{t('Allocations by project')}</h2>
            <table>
              <thead><tr><th>{t('Project')}</th><th>{t('Person')}</th><th>{t('Role')}</th><th>{t('Allocation')}</th></tr></thead>
              <tbody>
                {d.byProject.map((a: any, i: number) => (
                  <tr key={i}>
                    <td className="num">{a.projectCode}</td>
                    <td>{a.name}</td>
                    <td className="dim">{a.role}</td>
                    <td className="num">{a.allocationPct}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </Loaded>
    </Page>
  );
}

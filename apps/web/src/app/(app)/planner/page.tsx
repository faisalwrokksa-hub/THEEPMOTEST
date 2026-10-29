import { api } from '@/lib/api';
import { Page, Loaded } from '@/components/Page';
import { NewRecord, Flash } from '@/components/NewRecord';
import { when } from '@/lib/fmt';
import { tr, getLang } from '@/lib/i18n';
import { fill } from '@pmo/contracts';

const day = 86400000;

export default async function Planner({ searchParams }:
  { searchParams: Promise<{ error?: string; done?: string }> }) {
  const { error, done } = await searchParams;
  const lang = await getLang();
  const t = await tr();
  // Outside <Loaded> on purpose: the create form must render even when the
  // list below is empty, which is precisely when someone needs it.
  const o = await api.createOptions().catch(() => ({ projects: [], people: [] }));
  return (
    <Page title="Planner, Gantt & Calendar"
          sub="Delivery dates against baseline. A red edge means the item finishes later than it was originally planned to.">
      <Flash error={error} done={done} lang={lang} />
      <NewRecord lang={lang} kind="schedule-item" title="New schedule item" cta="Add to schedule" returnTo="/planner"
        intro="Leave the baseline blank and it is set from the planned dates. Slippage is measured against the baseline, so an item without one can never show as late."
        fields={[
                { name: 'projectId', label: 'Project', type: 'select', required: true,
                  options: o.projects.map((p: any) => ({ value: p.id, label: `${p.code} — ${p.name}` })) },
                { name: 'name', label: 'Item', required: true, placeholder: 'Enabling works' },
                { name: 'kind', label: 'Type', type: 'select', options: [
                  { value: 'activity', label: 'Activity' }, { value: 'phase', label: 'Phase' },
                  { value: 'milestone', label: 'Milestone' }] },
                { name: 'startDate', label: 'Start', type: 'date' },
                { name: 'endDate', label: 'Finish', type: 'date' },
                { name: 'baselineStart', label: 'Baseline start', type: 'date', hint: 'Defaults to the start date' },
                { name: 'baselineEnd', label: 'Baseline finish', type: 'date', hint: 'Defaults to the finish date' },
                { name: 'progressPct', label: 'Progress %', type: 'number', min: 0, max: 100, step: 1 },
                { name: 'isCritical', label: 'On the critical path', type: 'checkbox' },
              ]} />
      <Loaded load={api.schedule} empty="No schedule items yet.">
        {(items) => {
          const dated = items.filter((i: any) => i.startDate && i.endDate);
          const min = Math.min(...dated.map((i: any) => +new Date(i.startDate)));
          const max = Math.max(...dated.map((i: any) => +new Date(i.endDate)));
          const span = Math.max(1, (max - min) / day);
          const left = (d: string) => ((+new Date(d) - min) / day / span) * 100;
          const width = (a: string, b: string) =>
            Math.max(1.2, ((+new Date(b) - +new Date(a)) / day / span) * 100);

          // month ticks across the top
          const ticks: { label: string; at: number }[] = [];
          const c = new Date(min); c.setDate(1);
          while (+c <= max) {
            ticks.push({ label: c.toLocaleDateString(
              // The Gantt axis was hard-coded to English, so an Arabic
              // schedule ran Jan…Dec across the top of an Arabic page.
              lang === 'ar' ? 'ar-SA-u-ca-gregory-nu-latn' : 'en-GB',
              { month: 'short' }), at: left(c.toISOString()) });
            c.setMonth(c.getMonth() + 1);
          }

          return (
            <>
              <div className="gantt">
                <div className="grow ghead">
                  <div className="glabel" />
                  <div className="gtrack">
                    {ticks.map((t, i) => t.at >= 0 && t.at <= 100 && (
                      <span key={i} className="gtick" style={{ left: `${t.at}%` }}>{t.label}</span>
                    ))}
                  </div>
                </div>
                {items.map((i: any) => (
                  <div className="grow" key={i.id}>
                    <div className="glabel">
                      <span className="num dim">{i.projectCode}</span> {i.name}
                      {i.isCritical && <b title={t('On the critical path')}>{t('critical')}</b>}
                    </div>
                    <div className="gtrack">
                      {ticks.map((t, k) => t.at >= 0 && t.at <= 100 && (
                        <span key={k} className="gline" style={{ left: `${t.at}%` }} />
                      ))}
                      {i.baselineStart && i.baselineEnd && (
                        <span className="gbase" title={`Baseline: ${when(i.baselineStart, lang)} → ${when(i.baselineEnd, lang)}`}
                              style={{ left: `${left(i.baselineStart)}%`, width: `${width(i.baselineStart, i.baselineEnd)}%` }} />
                      )}
                      {i.startDate && i.endDate && (
                        i.kind === 'milestone'
                          ? <span className={`gdiamond${i.slipDays > 0 ? ' slipped' : ''}`}
                                  title={`${i.name} — ${when(i.startDate, lang)}`}
                                  style={{ left: `${left(i.startDate)}%` }} />
                          : <span className={`gbar${i.slipDays > 0 ? ' slipped' : ''}`}
                                  title={`${when(i.startDate, lang)} → ${when(i.endDate, lang)} · ${i.progressPct}% done${i.slipDays > 0 ? ` · ${i.slipDays} days late` : ''}`}
                                  style={{ left: `${left(i.startDate)}%`, width: `${width(i.startDate, i.endDate)}%` }}>
                              <i style={{ width: `${i.progressPct}%` }} />
                            </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <div className="glegend">
                <span><i className="sw gbase-sw" />{t('baseline')}</span>
                <span><i className="sw gbar-sw" />{t('actual, filled by progress')}</span>
                <span><i className="sw gslip-sw" />{t('finishing later than baseline')}</span>
              </div>

              <h2 className="sec">{t('Slippage against baseline')}</h2>
              <table>
                <thead><tr><th>{t('Project')}</th><th>{t('Item')}</th><th>{t('Planned finish')}</th><th>{t('Now finishing')}</th><th>{t('Slip')}</th><th>{t('Progress')}</th></tr></thead>
                <tbody>
                  {items.filter((i: any) => i.baselineEnd).map((i: any) => (
                    <tr key={i.id}>
                      <td className="num">{i.projectCode}</td>
                      <td><bdi>{i.name}</bdi>{i.isCritical && <div className="crit">{t('on critical path')}</div>}</td>
                      <td>{when(i.baselineEnd, lang)}</td>
                      <td>{when(i.endDate, lang)}</td>
                      <td className={i.slipDays > 0 ? 'crit' : 'good'}>
                        {i.slipDays > 0
                          ? <bdi>{fill(t('{n} days late'), { n: i.slipDays })}</bdi>
                          : t('on time')}</td>
                      <td className="num">{i.progressPct}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          );
        }}
      </Loaded>
    </Page>
  );
}

import { api } from '@/lib/api';
import { Page, Loaded } from '@/components/Page';
import { when, ago } from '@/lib/fmt';
import { tr, getLang } from '@/lib/i18n';

const STATUS_LABEL: Record<string, string> = {
  approved: 'passed', active: 'open now', locked: 'locked', rejected: 'rejected',
};

export default async function ProjectGovernance({ params, searchParams }: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ error?: string; done?: string }>;
}) {
  const { projectId } = await params;
  const { error, done } = await searchParams;
  const lang = await getLang();
  const t = await tr();
  const returnTo = `/governance/${projectId}`;

  return (
    <Loaded load={() => api.projectGovernance(projectId)}>
      {(d) => {
        const active = d.gates.find((g: any) => g.status === 'active');
        const crit = (gid: string) => d.criteria.filter((c: any) => c.gateId === gid);
        const appr = (gid: string) => d.approvals.filter((a: any) => a.gateId === gid);
        const blks = (gid: string) =>
          d.blockers.filter((b: any) => b.gateId === gid && b.status !== 'closed');

        const activeCrit = active ? crit(active.id) : [];
        const metCount = activeCrit.filter((c: any) => c.isMet).length;
        const pending = active ? appr(active.id).filter((a: any) => a.decision === 'pending') : [];
        const openBlocks = active ? blks(active.id) : [];
        const ready = !!active && activeCrit.length > 0 &&
          metCount === activeCrit.length && pending.length === 0 && openBlocks.length === 0;

        return (
          <Page title={`${d.project.code} — ${d.project.name}`}
                sub={`Stage gate governance. ${d.project.progressPct}% complete · health ${d.project.health.replace('_', ' ')}.`}>
            {error && <p className="err" role="alert" style={{ marginBlockEnd: 18 }}>
              <strong>{t('Could not do that.')}</strong> {error}</p>}
            {done && !error && <p className="okmsg" role="status" style={{ marginBlockEnd: 18 }}>
              {t('Saved.')}</p>}

            {/* gate rail */}
            <ol className="gaterail">
              {d.gates.map((g: any) => {
                const c = crit(g.id);
                const m = c.filter((x: any) => x.isMet).length;
                return (
                  <li key={g.id} className={`gs-${g.status}`}>
                    <span className="dot">{g.status === 'approved' ? '✓' : g.status === 'locked' ? '🔒' : g.seq}</span>
                    <b>SG{g.seq}</b>
                    <em>{g.name}</em>
                    <small>{STATUS_LABEL[g.status]}{c.length ? ` · ${m}/${c.length}` : ''}</small>
                  </li>
                );
              })}
            </ol>

            {!active ? (
              <div className="panel" style={{ marginBlockStart: 26 }}>
                <span className="tag">{t('Complete')}</span>
                <p style={{ margin: '12px 0 0' }}>{t('Every gate has been passed. This project is closed.')}</p>
              </div>
            ) : (
              <>
                <h2 className="sec">SG{active.seq} {t(active.name)} — {t('open since')} {when(active.openedAt, lang)}</h2>

                <div className={`gatebar ${ready ? 'ok' : 'blocked'}`}>
                  <div>
                    <strong>{ready ? 'Ready to pass' : 'Cannot pass yet'}</strong>
                    <span className="dim">
                      {metCount}/{activeCrit.length} criteria · {pending.length} signature(s) outstanding
                      · {openBlocks.length} blocker(s)
                    </span>
                  </div>
                  <form method="post" action="/api/govern">
                    <input type="hidden" name="intent" value="advance" />
                    <input type="hidden" name="id" value={active.id} />
                    <input type="hidden" name="returnTo" value={returnTo} />
                    <button className="btn" type="submit" disabled={!ready}
                            title={ready ? 'Pass this gate and open the next' : 'Clear the items below first'}>
                      {t('Pass this gate')}
                    </button>
                  </form>
                </div>

                <h3 style={{ margin: '26px 0 10px' }}>{t('Entry criteria')}</h3>
                <div className="critlist">
                  {activeCrit.map((c: any) => (
                    <form className={`critrow${c.isMet ? ' met' : ''}`} key={c.id}
                          method="post" action="/api/govern">
                      <input type="hidden" name="intent" value="criterion" />
                      <input type="hidden" name="id" value={c.id} />
                      <input type="hidden" name="returnTo" value={returnTo} />
                      <input type="hidden" name="isMet" value={c.isMet ? 'false' : 'true'} />
                      <span className="mark" aria-hidden="true">{c.isMet ? '✓' : ''}</span>
                      <span className="body">
                        <b>{c.label}</b>
                        {c.isMet ? (
                          <em>
                            met {when(c.metAt, lang)}{c.metBy ? ` by ${c.metBy}` : ''}
                            {c.evidenceUrl && <> · <a href={c.evidenceUrl}>evidence</a></>}
                          </em>
                        ) : (
                          <input className="ev" name="evidenceUrl" type="url"
                                 placeholder="Link to the evidence document (required)"
                                 defaultValue={c.evidenceUrl ?? ''} />
                        )}
                      </span>
                      <button className={`btn ${c.isMet ? 'ghost' : ''}`} type="submit">
                        {c.isMet ? 'Undo' : 'Mark met'}
                      </button>
                    </form>
                  ))}
                </div>

                <form className="addrow" method="post" action="/api/govern">
                  <input type="hidden" name="intent" value="addCriterion" />
                  <input type="hidden" name="id" value={active.id} />
                  <input type="hidden" name="returnTo" value={returnTo} />
                  <span className="body">
                    <b>{t('Add a criterion')}</b>
                    <em>{t('Anything else that must be proven before this gate opens.')}</em>
                  </span>
                  <div className="row">
                    <input name="label" required minLength={3}
                           placeholder="e.g. Municipality inspection passed" />
                    <button className="btn" type="submit">{t('Add')}</button>
                  </div>
                </form>

                <h3 style={{ margin: '26px 0 10px' }}>{t('Approvals')}</h3>
                <div className="critlist">
                  {appr(active.id).map((a: any) => (
                    <div className={`critrow${a.decision !== 'pending' ? ' met' : ''}`} key={a.id}>
                      <span className="mark" aria-hidden="true">{a.decision === 'approved' ? '✓' : a.decision === 'rejected' ? '✕' : ''}</span>
                      <span className="body">
                        <b>{a.approver ?? 'Unassigned'}{' '}
                          {a.isAccountable
                            ? <span className="pill critical">accountable</span>
                            : <span className="pill s-closed">consulted</span>}
                        </b>
                        <em>
                          {a.decision === 'pending' ? 'awaiting signature'
                            : `${a.decision} ${when(a.decidedAt, lang)}${a.comment ? ` — “${a.comment}”` : ''}`}
                        </em>
                      </span>
                      {a.decision === 'pending' && (
                        <span className="acts">
                          <form method="post" action="/api/govern">
                            <input type="hidden" name="intent" value="decide" />
                            <input type="hidden" name="id" value={a.id} />
                            <input type="hidden" name="decision" value="approved" />
                            <input type="hidden" name="returnTo" value={returnTo} />
                            <button className="btn" type="submit">Sign</button>
                          </form>
                          <form method="post" action="/api/govern">
                            <input type="hidden" name="intent" value="decide" />
                            <input type="hidden" name="id" value={a.id} />
                            <input type="hidden" name="decision" value="rejected" />
                            <input type="hidden" name="returnTo" value={returnTo} />
                            <button className="btn ghost" type="submit">{t('Reject')}</button>
                          </form>
                        </span>
                      )}
                    </div>
                  ))}
                  {appr(active.id).length === 0 &&
                    <div className="empty"><strong>{t('No approvers assigned to this gate')}</strong>
                      <p>{t('A gate cannot be signed until someone is accountable for it.')}</p></div>}

                  {/* Reassigning stands the previous accountable owner down, so
                      there is always exactly one. */}
                  <form className="addrow" method="post" action="/api/govern">
                    <input type="hidden" name="intent" value="assign" />
                    <input type="hidden" name="id" value={active.id} />
                    <input type="hidden" name="returnTo" value={returnTo} />
                    <span className="body">
                      <b>{t('Set the accountable owner')}</b>
                      <em>{t('One person owns this decision. Reassigning replaces the current owner.')}</em>
                    </span>
                    <div className="row">
                      <select name="userId" defaultValue="" required aria-label="Accountable owner">
                        <option value="" disabled>{t('Choose a person…')}</option>
                        {d.members.map((m: any) => (
                          <option key={m.id} value={m.id}>
                            {m.name} — {m.role.replace(/_/g, ' ')}
                          </option>
                        ))}
                      </select>
                      <button className="btn" type="submit">{t('Assign')}</button>
                    </div>
                  </form>
                </div>

                <h3 style={{ margin: '26px 0 10px' }}>{t('Blocking this gate')}</h3>
                {openBlocks.length === 0 ? (
                  <div className="empty"><strong>{t('Nothing is blocking')}</strong>
                    <p>{t('No open register item points at this gate.')}</p></div>
                ) : (
                  <div className="critlist">
                    {openBlocks.map((b: any) => (
                      <div className="critrow blocking" key={b.id}>
                        <span className="mark" aria-hidden="true">!</span>
                        <span className="body">
                          <b>{b.title}</b>
                          <em><span className={`kind k-${b.kind}`}>{b.kind}</span> · status {b.status}</em>
                        </span>
                        <form method="post" action="/api/govern">
                          <input type="hidden" name="intent" value="raid" />
                          <input type="hidden" name="id" value={b.id} />
                          <input type="hidden" name="status" value="closed" />
                          <input type="hidden" name="returnTo" value={returnTo} />
                          <button className="btn ghost" type="submit">{t('Close item')}</button>
                        </form>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            <h2 className="sec">{t('What has happened')}</h2>
            {d.history.length === 0
              ? <div className="empty"><strong>{t('No governance activity yet')}</strong></div>
              : (
                <ol className="feed">
                  {d.history.map((h: any) => (
                    <li key={h.id}>
                      <span className="kind">{h.action}</span>
                      <strong>{h.actor}</strong>
                      {h.diff && <code>{Object.entries(h.diff).slice(0, 3)
                        .map(([k, v]) => `${k}: ${String(v).slice(0, 34)}`).join(', ')}</code>}
                      <i>{ago(h.at, lang)}</i>
                    </li>
                  ))}
                </ol>
              )}
          </Page>
        );
      }}
    </Loaded>
  );
}

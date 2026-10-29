import { api } from '@/lib/api';
import { Page, Loaded } from '@/components/Page';
import { Flash } from '@/components/NewRecord';
import { getLang } from '@/lib/i18n';

const COLS = [
  ['todo', 'To do'], ['in_progress', 'In progress'],
  ['blocked', 'Blocked'], ['done', 'Done'],
] as const;

/**
 * Moving a card is a plain form POST, not a drag gesture.
 *
 * A drag needs JavaScript, a pointer and a steady hand; a button works on a
 * phone, on a touchpad, with a keyboard and with the client bundle broken —
 * and it goes through the same audited write path as every other change.
 */
function Move({ id, to, label, glyph }:
  { id: string; to: string; label: string; glyph: string }) {
  return (
    <form method="post" action="/api/govern">
      <input type="hidden" name="intent" value="task" />
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="state" value={to} />
      <input type="hidden" name="returnTo" value="/board" />
      <button type="submit" className="movebtn" title={`Move to ${label}`}
              aria-label={`Move to ${label}`}>{glyph}</button>
    </form>
  );
}

export default async function BoardPage({ searchParams }:
  { searchParams: Promise<{ error?: string; done?: string }> }) {
  const { error, done } = await searchParams;
  const lang = await getLang();
  return (
    <Page title="Work Board"
          sub="Day-to-day work across the portfolio, by workflow state. Use the arrows on a card to move it — every move is recorded in the audit trail.">
      <Flash error={error} done={done} lang={lang} />
      <Loaded load={api.tasks} empty="No tasks yet.">
        {(tasks) => (
          <div className="board">
            {COLS.map(([state, label], i) => {
              const col = tasks.filter((t) => t.state === state);
              const prev = COLS[i - 1];
              const next = COLS[i + 1];
              return (
                <section key={state} className="col">
                  <header>{label} <span className="count">{col.length}</span></header>
                  {col.length === 0
                    ? <p className="dim" style={{ padding: '8px 2px' }}>—</p>
                    : col.map((t) => (
                        <article key={t.id} className={`tcard${state === 'blocked' ? ' blocked' : ''}`}>
                          <div className="num dim">{t.projectCode}</div>
                          <strong>{t.title}</strong>
                          <div className="dim">
                            {t.assignee ?? 'unassigned'}{t.dueDate ? ` · due ${t.dueDate}` : ''}
                          </div>
                          <div className="moverow">
                            {prev ? <Move id={t.id} to={prev[0]} label={prev[1]} glyph="←" />
                                  : <span />}
                            {next ? <Move id={t.id} to={next[0]} label={next[1]} glyph="→" />
                                  : <span />}
                          </div>
                        </article>
                      ))}
                </section>
              );
            })}
          </div>
        )}
      </Loaded>
    </Page>
  );
}

import { api } from '@/lib/api';
import { Page, Loaded } from '@/components/Page';
import { ago, when } from '@/lib/fmt';
import { tr, getLang } from '@/lib/i18n';

export default async function Activity() {
  const lang = await getLang();
  const t = await tr();
  return (
    <Page title="Activity & Attention"
          sub="What changed, and what needs a decision now. The audit trail is append-only — nothing here can be edited after the fact.">
      <Loaded load={api.activity}>
        {(d) => (
          <>
            <h2 className="sec" style={{ marginTop: 0 }}>{t('Needs a decision')}</h2>
            {d.needs.length === 0 ? <p className="quietempty">{t('Nothing outstanding.')}</p> : (
              <table>
                <thead><tr><th>{t('Type')}</th><th>{t('Project')}</th><th>{t('Detail')}</th><th>{t('Due')}</th></tr></thead>
                <tbody>{d.needs.map((n: any, i: number) => (
                  <tr key={i}>
                    <td><span className={`kind ${n.kind === 'Gate blocked' ? 'k-dependency' : n.kind === 'Overdue task' ? 'k-risk' : ''}`}>
                      {/* The API sends these as words, not codes, so they are
                          UI text and need translating like any other label. */}
                      {t(n.kind)}</span></td>
                    <td className="num">{n.ref}</td>
                    <td>{n.detail}</td>
                    <td className={n.due && new Date(n.due) < new Date() ? 'crit' : undefined}>
                      {when(n.due, lang)}</td>
                  </tr>))}</tbody>
              </table>
            )}

            <h2 className="sec">{t('Audit trail')}</h2>
            {d.feed.length === 0
              ? <p className="quietempty">{t('No activity recorded yet. Create or change a project and it will appear here.')}</p>
              : (
                <ol className="feed">
                  {d.feed.map((e: any) => (
                    <li key={e.id}>
                      <span className="kind">{e.entity} {e.action}</span>
                      <strong>{e.actor}</strong>
                      {e.diff && <code>{JSON.stringify(e.diff)}</code>}
                      <i>{ago(e.at, lang)}</i>
                    </li>
                  ))}
                </ol>
              )}
          </>
        )}
      </Loaded>
    </Page>
  );
}

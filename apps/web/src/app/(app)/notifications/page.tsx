import { api } from '@/lib/api';
import { Page, Loaded } from '@/components/Page';
import { tr, getLang, term } from '@/lib/i18n';
import { when, ago } from '@/lib/fmt';

const PILL: Record<string, string> = {
  sent: 'on_track', queued: 'at_risk', failed: 'critical', suppressed: 's-closed',
};

export default async function Notifications({ searchParams }:
  { searchParams: Promise<{ error?: string; done?: string }> }) {
  const { error, done } = await searchParams;
  const lang = await getLang();
  const t = await tr();

  return (
    <Page title="Notifications"
          sub="What the platform has decided someone needs to be told, and whether it reached them. Every message is recorded before it is sent, so nothing is lost when mail is not configured.">
      {error && <p className="err" role="alert" style={{ marginBlockEnd: 16 }}>{t(error)}</p>}
      {done && !error && <p className="okmsg" role="status" style={{ marginBlockEnd: 16 }}>{t('Rules run.')}</p>}

      <Loaded load={api.notifications}>
        {(d: any) => (
          <>
            <div className={`panel ${d.transport.delivers ? 'importok' : 'importbad'}`}>
              <h2 style={{ fontSize: 'var(--fs-lg)', margin: 0 }}>
                {d.transport.delivers ? t('Mail is being delivered') : t('Nothing is being sent yet')}
              </h2>
              <p className="dim" style={{ margin: '10px 0 0', maxWidth: '78ch' }}>{d.transport.status}</p>
              <form method="post" action="/api/notifications/run" style={{ marginBlockStart: 14 }}>
                <button className="btn" type="submit">{t('Run the rules now')}</button>
              </form>
            </div>

            <div className="tiles">
              {['queued', 'sent', 'failed', 'suppressed'].map((s) => (
                <div className={`tile${s === 'failed' && d.counts.failed ? ' alarm' : ''}`} key={s}>
                  <span>{t(s)}</span>
                  <strong>{d.counts[s] ?? 0}</strong>
                  <div className="split"><i className="dim">{t(HINT[s])}</i></div>
                </div>
              ))}
            </div>

            <h2 className="sec">{t('The outbox')}</h2>
            {d.items.length === 0 ? (
              <div className="empty">
                <strong>{t('Nothing to send')}</strong>
                <p>{t('No rule has matched yet. Rules live under Platform Studio — a gate that cannot pass, a signature outstanding or an overdue task will each put a message here.')}</p>
              </div>
            ) : (
              <div className="tablewrap">
                <table>
                  <thead><tr>
                    <th>{t('Status')}</th><th>{t('Type')}</th><th>{t('To')}</th>
                    <th>{t('Subject')}</th><th>{t('When')}</th>
                  </tr></thead>
                  <tbody>
                    {d.items.map((m: any) => (
                      <tr key={m.id}>
                        <td><span className={`pill ${PILL[m.status] ?? 's-closed'}`}>{term(t, m.status)}</span></td>
                        <td><code>{m.kind}</code></td>
                        <td>{m.toEmail}</td>
                        <td>
                          {m.subject}
                          {m.error && <div className="crit" style={{ fontSize: 'var(--fs-sm)' }}>{m.error}</div>}
                        </td>
                        <td className="num">
                          {m.sentAt ? when(m.sentAt, lang) : ago(m.createdAt, lang)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <details className="explain">
              <summary>{t('Why the same blocked gate does not email you every hour')}</summary>
              <p>{t('These rules describe conditions, not events: a gate blocked on Monday is still blocked on Tuesday, so a rule that simply fired whenever it found one would send the same message forever. Each message carries a key built from what is actually wrong, and the database refuses a second message under the same key — so you are told once, and told again only when the situation genuinely changes. Clear one of three blockers and you get a fresh message naming the two that remain.')}</p>
            </details>
          </>
        )}
      </Loaded>
    </Page>
  );
}

const HINT: Record<string, string> = {
  queued: 'written, waiting to go',
  sent: 'accepted by the mail provider',
  failed: 'rejected — the reason is on the row',
  suppressed: 'held back deliberately',
};

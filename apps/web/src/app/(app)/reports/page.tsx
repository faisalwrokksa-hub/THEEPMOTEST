import { api } from '@/lib/api';
import { Page, Loaded } from '@/components/Page';
import { when } from '@/lib/fmt';
import { tr, getLang } from '@/lib/i18n';

export default async function Reports() {
  const lang = await getLang();
  const t = await tr();
  return (
    <Page title="Reporting & Exports"
          sub="Board packs generated from live data rather than assembled by hand.">
      <Loaded load={api.reports} empty="No report definitions yet.">
        {(list) => (
          <>
            <table>
              <thead><tr><th>{t('Report')}</th><th>{t('Audience')}</th><th>{t('Schedule')}</th><th>{t('Last generated')}</th><th></th></tr></thead>
              <tbody>
                {list.map((r: any) => (
                  <tr key={r.id}>
                    <td><strong>{r.name}</strong><div className="dim">{r.kind.replace('_', ' ')}</div></td>
                    <td>{r.audience}</td>
                    <td className="dim">{r.schedule ?? 'on demand'}</td>
                    <td>{r.lastRunAt ? when(r.lastRunAt, lang) : <span className="dim">never</span>}</td>
                    <td><a className="btn" href="/reports/board-pack">Open</a></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <h2 className="sec">{t('Take the board pack away')}</h2>
            <div className="xlgrid">
              <section className="panel">
                <h2>{t('Word')}</h2>
                <p className="dim">{t('The full pack — position, gate status, decisions required, decisions taken and benefits. Editable, so a board secretary can add their own commentary before circulating it.')}</p>
                <div className="btnrow">
                  <a className="btn" href={`/api/export/board-pack.docx?lang=${lang}`}>{t('Download Word')}</a>
                </div>
              </section>
              <section className="panel">
                <h2>{t('PowerPoint')}</h2>
                <p className="dim">{t('Four slides for the meeting itself: cover, position, gate status and the decisions the board has to make. Few slides, large numbers.')}</p>
                <div className="btnrow">
                  <a className="btn" href={`/api/export/board-pack.pptx?lang=${lang}`}>{t('Download PowerPoint')}</a>
                </div>
              </section>
              <section className="panel">
                <h2>{t('PDF')}</h2>
                <p className="dim">{t('The pack exactly as it appears on screen, fixed to the page. Arabic is joined and bidirectional lines are ordered correctly, so the Arabic pack reads as an Arabic document rather than a translated one.')}</p>
                <div className="btnrow">
                  <a className="btn" href={`/api/export/board-pack.pdf?lang=${lang}`}>{t('Download PDF')}</a>
                  <a className="btn ghost" href="/reports/board-pack">{t('Open the board pack')}</a>
                </div>
              </section>
            </div>

            <details className="explain">
              <summary>{t('How the PDF is made')}</summary>
              <p>{t('Word and PowerPoint carry the text and leave the shaping to the application that opens them, so Arabic comes out right without this server carrying a text-shaping engine. A PDF has no such luxury: the glyphs and their order are fixed at the moment it is written, and no PDF library available to a Node service joins Arabic letters or reorders a bidirectional line. So the PDF is not written by a library at all — the pack is printed by a real browser on the server, the same one that renders it on screen. Arabic is therefore shaped by the same engine that has been doing it correctly for twenty years, and the document always matches the page, because it is the page.')}</p>
            </details>
          </>
        )}
      </Loaded>
    </Page>
  );
}

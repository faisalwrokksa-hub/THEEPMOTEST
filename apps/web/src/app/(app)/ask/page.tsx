import { api } from '@/lib/api';
import { Page, Loaded } from '@/components/Page';
import { tr, getLang } from '@/lib/i18n';
import { ago } from '@/lib/fmt';

const SUGGESTED = [
  'Which projects are at risk of missing their next gate, and why?',
  'Where are approvals stuck, and who is Accountable?',
  'Summarise portfolio health for the board.',
  'Which register items are holding up the most money?',
  'What has slipped furthest against its baseline?',
];

export default async function Ask({ searchParams }:
  { searchParams: Promise<{ thread?: string; error?: string }> }) {
  const { thread, error } = await searchParams;
  const lang = await getLang();
  const t = await tr();

  return (
    <Page title="Ask X"
          sub="A question answered from this workspace's own records — and only from those. Every figure it gives you traces to a row you can open.">
      {error && <p className="err" role="alert" style={{ marginBlockEnd: 16 }}>{t(error)}</p>}

      <Loaded load={async () => ({
        status: await api.askStatus(),
        threads: await api.askThreads(),
        messages: thread ? await api.askThread(thread) : [],
      })}>
        {({ status, threads, messages }: any) => (
          <>
            {!status.enabled && (
              <p className="thin">{status.note}</p>
            )}

            <div className="asklayout">
              <div className="askmain">
                {messages.length === 0 ? (
                  <div className="panel askintro">
                    <h2>{t('Ask about this portfolio')}</h2>
                    <p className="dim">{t('It reads the same records the screens do — every project, gate, register item, approval, benefit and slipped schedule item in this workspace. It has no access to anything else, and it will tell you when a question cannot be answered from them rather than guessing.')}</p>
                    <div className="suggest">
                      {SUGGESTED.map((q) => (
                        <form method="post" action="/api/ask" key={q}>
                          <input type="hidden" name="question" value={q} />
                          <input type="hidden" name="lang" value={lang} />
                          <button type="submit" className="chip">{t(q)}</button>
                        </form>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="thread">
                    {messages.map((m: any) => (
                      <div key={m.id} className={`bubble ${m.role}`}>
                        <span className="who">
                          {m.role === 'user' ? t('You') : 'Ask X'}
                          {m.model && <em title={m.model}> · {m.model.split('.').pop()?.split('-').slice(0, 3).join(' ')}</em>}
                        </span>
                        {m.content.split('\n').filter(Boolean).map((line: string, i: number) => (
                          <p key={i}>{line}</p>
                        ))}
                        <time className="dim">{ago(m.createdAt, lang)}</time>
                      </div>
                    ))}
                  </div>
                )}

                <form method="post" action="/api/ask" className="askbar">
                  {thread && <input type="hidden" name="threadId" value={thread} />}
                  <input type="hidden" name="lang" value={lang} />
                  <input name="question" required autoComplete="off"
                         placeholder={t('Ask anything about this portfolio…')} />
                  <button className="btn" type="submit">{t('Ask')}</button>
                </form>
                {messages.length > 0 && (
                  <p className="dim" style={{ fontSize: 'var(--fs-sm)' }}>
                    <a href="/ask">{t('Start a new conversation')}</a>
                  </p>
                )}
              </div>

              <aside className="askside">
                <h3>{t('Recent')}</h3>
                {threads.length === 0
                  ? <p className="dim">{t('Nothing asked yet.')}</p>
                  : (
                    <ul className="threadlist">
                      {threads.map((x: any) => (
                        <li key={x.threadId} data-on={x.threadId === thread}>
                          <a href={`/ask?thread=${x.threadId}`}>
                            {x.opening.length > 70 ? `${x.opening.slice(0, 70)}…` : x.opening}
                            <em>{ago(x.createdAt, lang)}</em>
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}
              </aside>
            </div>

            <details className="explain">
              <summary>{t('How it is kept honest')}</summary>
              <p>{t('The assistant is given this workspace’s records as facts and instructed to use nothing else — no general knowledge, no estimates, no filling in gaps. It is told to name the specific project, gate or register item behind every claim, and to say plainly when the records do not answer the question. That last rule matters most: a governance assistant that guesses produces a number somebody repeats to a board, and the whole point of this platform is that a figure can be traced to a record.')}</p>
              <p>{t('Questions and answers are stored, along with a summary of the facts the answer was based on, so an answer someone acted on can be checked afterwards rather than remembered.')}</p>
            </details>
          </>
        )}
      </Loaded>
    </Page>
  );
}

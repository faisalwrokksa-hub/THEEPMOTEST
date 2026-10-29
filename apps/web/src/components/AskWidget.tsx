'use client';
import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { translator, type Lang } from '@/lib/i18n-dict';

/**
 * The assistant, available on every screen.
 *
 * Deliberately not a destination. A question about the portfolio arrives while
 * you are looking at the portfolio — making someone leave the gate they are
 * reading, ask elsewhere, and come back is the design that gets a feature
 * used twice and then forgotten. It also means the panel can tell the model
 * which page you are on, so "why is this blocked" has a referent.
 */
type Msg = { role: 'user' | 'assistant'; content: string; model?: string };

const SUGGESTED = [
  'Which projects are at risk of missing their next gate?',
  'Where are approvals stuck, and who is Accountable?',
  'Summarise portfolio health for the board.',
];

export function AskWidget({ lang = 'en', enabled = true }: { lang?: Lang; enabled?: boolean }) {
  const t = translator(lang);
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [threadId, setThreadId] = useState<string | undefined>();
  const scroller = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  // ⌘J / Ctrl-J. ⌘K already belongs to the command palette.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'j') {
        e.preventDefault(); setOpen((v) => !v);
      }
      if (e.key === 'Escape' && open) setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  useEffect(() => { if (open) input.current?.focus(); }, [open]);
  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' });
  }, [msgs, busy]);

  async function send(question: string) {
    const text = question.trim();
    if (!text || busy) return;
    setQ(''); setError(null);
    setMsgs((m) => [...m, { role: 'user', content: text }]);
    setBusy(true);
    try {
      const res = await fetch('/api/ask/send', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ question: text, threadId, lang, path }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? `Failed (${res.status})`);
      setThreadId(body.threadId);
      setMsgs((m) => [...m, { role: 'assistant', content: body.answer, model: body.model }]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      input.current?.focus();
    }
  }

  if (!enabled) return null;

  return (
    <>
      <button className={`asklaunch${open ? ' on' : ''}`} onClick={() => setOpen((v) => !v)}
              aria-expanded={open} aria-controls="askpanel"
              title={`${t('Ask X')} · ⌘J`}>
        <Spark />
        <span>{t('Ask X')}</span>
      </button>

      <section id="askpanel" className={`askpanel${open ? ' open' : ''}`}
               role="dialog" aria-label={t('Ask X')} aria-hidden={!open}>
        <header>
          <span className="tag"><Spark /> {t('Ask X')}</span>
          <div className="sp" />
          {msgs.length > 0 && (
            <button className="linkish" onClick={() => { setMsgs([]); setThreadId(undefined); setError(null); }}>
              {t('New')}
            </button>
          )}
          <button className="x" onClick={() => setOpen(false)} aria-label={t('Close')}>×</button>
        </header>

        <div className="askscroll" ref={scroller}>
          {msgs.length === 0 && (
            <div className="askempty">
              <p>{t('Ask about anything in this workspace. Answers come from its records only — and it will say so when a question cannot be answered from them.')}</p>
              <div className="suggest">
                {SUGGESTED.map((s) => (
                  <button key={s} className="chip" onClick={() => send(s)}>{t(s)}</button>
                ))}
              </div>
            </div>
          )}

          {msgs.map((m, i) => (
            <div key={i} className={`bubble ${m.role}`}>
              {m.role === 'assistant' && <span className="who"><Spark /> Ask X</span>}
              {m.content.split('\n').filter((l) => l.trim()).map((line, j) => <p key={j}>{line}</p>)}
            </div>
          ))}

          {busy && (
            <div className="bubble assistant thinking" aria-live="polite">
              <span className="who"><Spark /> Ask X</span>
              <span className="dots"><i /><i /><i /></span>
              <span className="dim">{t('Reading this workspace…')}</span>
            </div>
          )}

          {error && <p className="askerr" role="alert">{error}</p>}
        </div>

        <form className="askform" onSubmit={(e) => { e.preventDefault(); send(q); }}>
          <input ref={input} value={q} onChange={(e) => setQ(e.target.value)}
                 placeholder={t('Ask anything about this portfolio…')}
                 aria-label={t('Ask anything about this portfolio…')} disabled={busy} />
          <button className="btn" type="submit" disabled={busy || !q.trim()}>{t('Ask')}</button>
        </form>
        <footer>
          <span className="dim">{t('Grounded in this workspace only')}</span>
          {threadId && <a href={`/ask?thread=${threadId}`}>{t('Open full transcript')}</a>}
        </footer>
      </section>
    </>
  );
}

function Spark() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="currentColor">
      <path d="M8 1l1.5 4.2L13.8 6.7 9.5 8.2 8 12.4 6.5 8.2 2.2 6.7 6.5 5.2z" />
      <path d="M12.6 10.4l.7 1.9 1.9.7-1.9.7-.7 1.9-.7-1.9-1.9-.7 1.9-.7z" opacity=".65" />
    </svg>
  );
}

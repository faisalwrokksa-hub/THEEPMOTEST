'use client';
import { useEffect } from 'react';

/** Catches a render or fetch failure inside the app shell without blanking
 *  the whole page, and offers the one action that usually helps. */
export default function ErrorBoundary({ error, reset }:
  { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  const unreachable = /fetch failed|ECONNREFUSED|Cannot reach/i.test(error.message);
  return (
    <div className="panel" style={{ maxWidth: '62ch' }}>
      <span className="tag" style={{ background: 'var(--crit-soft)', color: 'var(--crit)' }}>
        Something went wrong
      </span>
      <h1 style={{ fontSize: 'var(--fs-xl)', margin: '14px 0 8px' }}>
        {unreachable ? 'The server is not responding' : 'This page could not be loaded'}
      </h1>
      <p className="dim">
        {unreachable
          ? 'The API is not reachable. If you are running locally, start it with pnpm dev and check pnpm smoke.'
          : 'The error has been logged. Try again, and if it persists quote the reference below.'}
      </p>
      {error.digest && <p className="dim">Reference: <code>{error.digest}</code></p>}
      <div style={{ display: 'flex', gap: 10, marginBlockStart: 16 }}>
        <button className="btn" onClick={reset}>Try again</button>
        <a className="btn ghost" href="/">Back to overview</a>
      </div>
    </div>
  );
}

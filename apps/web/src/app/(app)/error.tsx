'use client';
import { useEffect, useState } from 'react';

/** Recover from a page render/fetch failure without exposing developer commands. */
export default function ErrorBoundary({ error, reset }:
  { error: Error & { digest?: string }; reset: () => void }) {
  const [ar, setAr] = useState(false);
  useEffect(() => {
    // Root layout owns the document language. Read it after hydration so the
    // server and client initially render identical markup.
    setAr(document.documentElement.lang.toLowerCase().startsWith('ar'));
    console.error(error);
  }, [error]);
  const unreachable = /fetch failed|ECONNREFUSED|Cannot reach/i.test(error.message);
  return (
    <div className="panel" role="alert" style={{ maxWidth: '62ch' }}>
      <span className="tag" style={{ background: 'var(--crit-soft)', color: 'var(--crit)' }}>
        {ar ? 'حدث خطأ' : 'Something went wrong'}
      </span>
      <h1 style={{ fontSize: 'var(--fs-xl)', margin: '14px 0 8px' }}>
        {unreachable
          ? (ar ? 'الخادم لا يستجيب' : 'The server is not responding')
          : (ar ? 'تعذّر تحميل هذه الصفحة' : 'This page could not be loaded')}
      </h1>
      <p className="dim">
        {unreachable
          ? (ar ? 'الخدمة غير متاحة مؤقتًا. يرجى المحاولة مجددًا بعد قليل.'
                : 'The service is temporarily unavailable. Please try again shortly.')
          : (ar ? 'يرجى المحاولة مجددًا، وإذا استمرت المشكلة فتواصل مع الدعم.'
                : 'Try again. If the problem continues, contact support.')}
      </p>
      {error.digest && <p className="dim">{ar ? 'المرجع' : 'Reference'}: <code>{error.digest}</code></p>}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBlockStart: 16 }}>
        <button type="button" className="btn" onClick={reset}>{ar ? 'إعادة المحاولة' : 'Try again'}</button>
        <a className="btn ghost" href="/">{ar ? 'العودة إلى النظرة العامة' : 'Back to overview'}</a>
      </div>
    </div>
  );
}

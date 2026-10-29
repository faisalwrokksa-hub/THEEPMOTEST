'use client';
import { useState, type FormEvent } from 'react';
export function RecoveryRequestForm({ lang }: { lang: 'en' | 'ar' }) {
  const ar = lang === 'ar';
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState('');
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setError(''); setBusy(true);
    try {
      const res = await fetch('/api/password-recovery/request', { method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, lang }), cache: 'no-store' });
      if (!res.ok) throw new Error(ar ? 'تعذّر إرسال الطلب الآن. حاول لاحقًا.' : 'Recovery is unavailable right now. Try again later.');
      setComplete(true); setEmail('');
    } catch(e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  if (complete) return <p role="status">{ar ? 'إذا كان الحساب نشطًا فستصلك رسالة تحتوي على رابط الاستعادة.' : 'If an active account exists, a recovery link will be emailed.'}</p>;
  return <form className="authform" onSubmit={submit}>
    <label>{ar ? 'البريد الإلكتروني' : 'Account email'}
      <input type="email" autoComplete="email" value={email} required maxLength={254}
        onChange={e => setEmail(e.target.value)} /></label>
    {error && <p role="alert" className="formerr">{error}</p>}
    <button className="btn wide" type="submit" disabled={busy}>{busy ? '…' : (ar ? 'إرسال رابط الاستعادة' : 'Email recovery link')}</button>
  </form>;
}

'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { validInvitationToken, invitationErrorText } from '@/lib/invitation-feedback.mjs';

export function InviteForm({ lang }: { lang: 'en' | 'ar' }) {
  const ar = lang === 'ar';
  const [token, setToken] = useState('');
  const [ready, setReady] = useState(false);
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const busyGuard = useRef(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  useEffect(() => {
    const value = new URLSearchParams(window.location.hash.slice(1)).get('token') ?? '';
    // Remove the bearer secret from the address bar immediately after reading it.
    window.history.replaceState(null, '', '/accept-invite');
    setToken(value);
    setReady(true);
  }, []);
  async function accept(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busyGuard.current || !validInvitationToken(token)) return;
    busyGuard.current = true;
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/invite/accept', {
        method: 'POST', cache: 'no-store',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token, displayName: name, password }),
      });
      if (!response.ok) {
        setError(invitationErrorText(response.status, lang));
        return;
      }
      setDone(true); setToken(''); setPassword('');
    } catch {
      setError(invitationErrorText(0, lang));
    } finally {
      busyGuard.current = false;
      setBusy(false);
    }
  }
  if (!ready) return <p role="status">{ar ? 'جارٍ التحقق من الدعوة...' : 'Checking invitation…'}</p>;
  if (done) return <div role="status"><p>{ar ? 'تم قبول الدعوة. يمكنك تسجيل الدخول الآن.' : 'Invitation accepted. You can now sign in.'}</p>
    <Link href="/login">{ar ? 'تسجيل الدخول' : 'Sign in'}</Link></div>;
  if (!validInvitationToken(token)) return <p role="alert">{ar ? 'رابط الدعوة غير صالح أو مفقود.' : 'The invitation link is missing or invalid.'}</p>;
  return <form onSubmit={accept} aria-busy={busy} style={{ display: 'grid', gap: 12, maxWidth: 430 }}>
    <p>{ar ? 'إذا كان لديك حساب بالفعل، يمكنك ترك حقلي الاسم وكلمة المرور فارغين. لا تتغير كلمة مرورك الحالية.' :
      'If you already have an account, leave the name and password blank. Your existing password will not change.'}</p>
    <label>{ar ? 'اسمك (للحساب الجديد)' : 'Your name (new accounts)'}
      <input value={name} onChange={e => { setName(e.target.value); setError(''); }} maxLength={120} autoComplete="name" disabled={busy} /></label>
    <label>{ar ? 'كلمة مرور جديدة (12 حرفًا على الأقل)' : 'New password (at least 12 characters)'}
      <input type="password" value={password} onChange={e => { setPassword(e.target.value); setError(''); }} minLength={12} maxLength={200} autoComplete="new-password" disabled={busy} /></label>
    {error && <p role="alert" style={{ color: 'var(--red, #b42318)' }}>{error}</p>}
    <button disabled={busy} type="submit">{busy ? (ar ? 'جارٍ القبول...' : 'Accepting…') : (ar ? 'قبول الدعوة' : 'Accept invitation')}</button>
  </form>;
}

'use client';
import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
export function ResetPasswordForm({ lang }: { lang: 'en' | 'ar' }) {
  const ar = lang === 'ar';
  const [ready, setReady] = useState(false);
  const [token, setToken] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  useEffect(() => {
    const value = new URLSearchParams(window.location.hash.slice(1)).get('token') ?? '';
    // Scrub the secret from the address bar and history immediately.
    window.history.replaceState(null, '', '/reset-password');
    setToken(value); setReady(true);
  }, []);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setError('');
    if (password !== confirm) { setError(ar ? 'كلمتا المرور غير متطابقتين.' : 'Passwords do not match.'); return; }
    setBusy(true);
    try {
      const res = await fetch('/api/password-recovery/reset', { method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token, password }), cache: 'no-store' });
      if (!res.ok) throw new Error(ar ? 'الرابط غير صالح أو انتهت صلاحيته. اطلب رابطًا جديدًا.' : 'This link is invalid or expired. Request another one.');
      setDone(true); setToken(''); setPassword(''); setConfirm('');
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  if (!ready) return <p>{ar ? 'جارٍ التحقق من الرابط...' : 'Checking link…'}</p>;
  if (done) return <div role="status"><p>{ar ? 'تم تغيير كلمة المرور وإلغاء الجلسات القديمة.' : 'Password updated. All previous sessions were revoked.'}</p>
    <Link href="/login">{ar ? 'تسجيل الدخول' : 'Sign in'}</Link></div>;
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return <p role="alert">{ar ? 'رابط الاستعادة مفقود أو غير صالح.' : 'Recovery link is missing or invalid.'}
    {' '}<Link href="/forgot-password">{ar ? 'اطلب رابطًا جديدًا' : 'Request a new link'}</Link></p>;
  return <form className="authform" onSubmit={submit}>
    <label>{ar ? 'كلمة المرور الجديدة (12 حرفًا على الأقل)' : 'New password (at least 12 characters)'}
      <input type="password" value={password} onChange={e => setPassword(e.target.value)}
        minLength={12} maxLength={200} autoComplete="new-password" required /></label>
    <label>{ar ? 'تأكيد كلمة المرور' : 'Confirm password'}
      <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
        minLength={12} maxLength={200} autoComplete="new-password" required /></label>
    {error && <p role="alert" className="formerr">{error}</p>}
    <button type="submit" className="btn wide" disabled={busy}>{busy ? '…' : (ar ? 'تغيير كلمة المرور' : 'Reset password')}</button>
  </form>;
}

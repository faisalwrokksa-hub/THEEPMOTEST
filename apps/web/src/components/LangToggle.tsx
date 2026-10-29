'use client';
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';

/** Flips the whole app between English and Arabic — and LTR to RTL with it. */
export function LangToggle({ ar }: { ar: boolean }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  function flip() {
    document.cookie = `pmo_lang=${ar ? 'en' : 'ar'}; path=/; max-age=31536000; samesite=lax`;
    start(() => router.refresh());
  }
  return (
    <button className="iconbtn lang" onClick={flip} disabled={pending}
            title={ar ? 'Switch to English' : 'التبديل إلى العربية'}
            aria-label={ar ? 'Switch to English' : 'Switch to Arabic'}>
      {ar ? 'EN' : 'ع'}
    </button>
  );
}

'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { translator, type Lang } from '@/lib/i18n-dict';
import { validateCreateForm, formErrorText } from '@/lib/create-form-validation.mjs';
import { isCreateSuccess } from '@/lib/create-response.mjs';

type BaseField = { name: string; label: string; required?: boolean; hint?: string };
export type Field =
  | (BaseField & { type?: 'text' | 'date' | 'number' | 'url' | 'password' | 'email';
      placeholder?: string; minLength?: number; maxLength?: number;
      min?: number; max?: number; step?: number | 'any'; pattern?: string;
      autoComplete?: string })
  | (BaseField & { type: 'select'; options: { value: string; label: string }[];
      defaultValue?: string })
  | (BaseField & { type: 'checkbox'; defaultChecked?: boolean })
  | (BaseField & { type: 'textarea'; placeholder?: string; maxLength?: number });

/**
 * Accessible progressive-enhancement form: HTML validates without JavaScript;
 * client enhancement preserves input after a rejected submission and maps
 * API validation issues back to their fields. Server validation is authoritative.
 */
export function NewRecord({ kind, title, cta, fields, returnTo, intro, lang, initialOpen = false }: {
  kind: string; title: string; cta?: string; fields: Field[]; returnTo: string; intro?: string;
  lang?: Lang; initialOpen?: boolean;
}) {
  const t = translator(lang ?? 'en');
  const locale: 'en' | 'ar' = lang === 'ar' ? 'ar' : 'en';
  const id = useId();
  const busyGuard = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  const [open, setOpen] = useState(initialOpen);
  const [error, setError] = useState('');
  const [sessionExpired, setSessionExpired] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const message = (english: string, arabic: string) => locale === 'ar' ? arabic : english;

  const clearFieldError = (name: string) => {
    setFieldErrors(previous => {
      if (!previous[name]) return previous;
      const updated = { ...previous };
      delete updated[name];
      return updated;
    });
    setError('');
  };

  const focusFirstInvalid = (form: HTMLFormElement, errors: Record<string, string>) => {
    const first = fields.find(f => errors[f.name]);
    if (!first) return;
    const control = form.elements.namedItem(first.name);
    if (control && 'focus' in control && typeof control.focus === 'function') control.focus();
  };

  // Focus after React commits aria-invalid and error text to the DOM.
  useEffect(() => {
    if (formRef.current && Object.keys(fieldErrors).length) focusFirstInvalid(formRef.current, fieldErrors);
  }, [fieldErrors]);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busyGuard.current) return; // Prevent rapid double submission.
    const form = e.currentTarget;
    const values = Object.fromEntries(new FormData(form).entries());
    const validation = validateCreateForm(kind, values);
    if (Object.keys(validation).length > 0) {
      setFieldErrors(validation);
      setError(message('Please correct the highlighted fields.', 'يرجى تصحيح الحقول المميزة.'));
      return;
    }
    busyGuard.current = true;
    setBusy(true);
    setError('');
    setSessionExpired(false);
    setFieldErrors({});
    try {
      const res = await fetch(form.action, {
        method: 'POST', body: new FormData(form), headers: { accept: 'application/json' },
      });
      const j = await res.json().catch(() => ({}));
      if (!isCreateSuccess(res.status, j, window.location.origin)) {
        // Field paths come from the server; only render those present in this form.
        const validNames = new Set(fields.map(field => field.name));
        const issues: Record<string, string> = {};
        if (Array.isArray(j?.issues)) {
          for (const issue of j.issues) {
            if (issue && typeof issue.path === 'string' && validNames.has(issue.path)) {
              const required = typeof issue.message === 'string' && /required|undefined/i.test(issue.message);
              issues[issue.path] = required ? 'required' : 'invalid';
            }
          }
        }
        if (Object.keys(issues).length) {
          setFieldErrors(issues);
          setError(message('Please correct the highlighted fields.', 'يرجى تصحيح الحقول المميزة.'));
        } else {
          // Connection failure is retryable; submitted form values stay intact.
          // Avoid displaying raw English API error responses to Arabic users.
          if (res.status === 401) setSessionExpired(true);
          setError(res.status === 401
            ? message('Your session has expired. Sign in again to continue.',
                      'انتهت جلسة تسجيل الدخول. يرجى تسجيل الدخول مجددًا للمتابعة.')
            : res.status === 503
              ? message('The service is temporarily unavailable. Try again shortly.',
                        'الخدمة غير متاحة مؤقتًا. يرجى المحاولة مجددًا بعد قليل.')
              : res.status === 429
                ? message('Too many attempts. Please try again shortly.',
                          'عدد المحاولات كبير. يرجى المحاولة مجددًا بعد قليل.')
                : message('That could not be saved. Check your information and try again.',
                          'تعذّر الحفظ. تحقق من البيانات وحاول مجددًا.'));
        }
        return;
      }
      // Navigate only after confirmed success. Preserve the form on failure.
      window.location.assign(j.redirect);
    } catch {
      setError(t('Could not reach the server. Check your connection and try again.'));
    } finally {
      busyGuard.current = false;
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button className="btn newbtn" type="button" onClick={() => setOpen(true)}>
        <span aria-hidden="true">+</span> {t(title)}
      </button>
    );
  }

  return (
    <form ref={formRef} className="newform" method="post" action="/api/create" onSubmit={submit} aria-busy={busy}>
      <input type="hidden" name="__kind" value={kind} />
      <input type="hidden" name="__returnTo" value={returnTo} />
      <header>
        <strong>{t(title)}</strong>
        <button type="button" className="x" disabled={busy} onClick={() => setOpen(false)} aria-label={t('Cancel')}>×</button>
      </header>
      {intro && <p className="dim intro">{t(intro)}</p>}
      {error && <p className="formerr" role="alert">{error}{sessionExpired && <> <a href="/login">{message("Sign in", "تسجيل الدخول")}</a></>}</p>}
      <div className="grid">
        {fields.map(f => {
          const hintId = f.hint ? `${id}-${f.name}-hint` : undefined;
          const errId = fieldErrors[f.name] ? `${id}-${f.name}-error` : undefined;
          const describedBy = [hintId, errId].filter(Boolean).join(' ') || undefined;
          const invalid = Boolean(errId);
          return (
            <label key={f.name} className={f.type === 'textarea' || f.type === 'checkbox' ? 'wide' : undefined}>
              {f.type === 'checkbox' ? (
                <span className="check">
                  <input type="checkbox" name={f.name} defaultChecked={f.defaultChecked} onChange={() => clearFieldError(f.name)} />
                  {t(f.label)}
                </span>
              ) : (
                <>
                  <span className="cap">{t(f.label)}{f.required && <em aria-hidden="true">*</em>}</span>
                  {f.hint && <small className="dim" id={hintId}>{t(f.hint)}</small>}
                  {f.type === 'select' ? (
                    <select name={f.name} required={f.required} defaultValue={f.defaultValue ?? ''}
                            aria-invalid={invalid} aria-describedby={describedBy}
                            onChange={() => clearFieldError(f.name)}>
                      <option value="">{t(f.required ? 'Choose…' : '— none —')}</option>
                      {f.options.map(o => <option key={o.value} value={o.value}>{t(o.label)}</option>)}
                    </select>
                  ) : f.type === 'textarea' ? (
                    <textarea name={f.name} rows={3} placeholder={f.placeholder}
                              required={f.required} maxLength={f.maxLength}
                              aria-invalid={invalid} aria-describedby={describedBy}
                              onChange={() => clearFieldError(f.name)} />
                  ) : (
                    <input name={f.name} type={f.type ?? 'text'} required={f.required}
                           minLength={f.minLength} maxLength={f.maxLength}
                           min={f.min} max={f.max} step={f.step} pattern={f.pattern}
                           autoComplete={f.autoComplete} placeholder={f.placeholder}
                           aria-invalid={invalid} aria-describedby={describedBy}
                           onChange={() => clearFieldError(f.name)} />
                  )}
                  {errId && <small className="field-error" id={errId}>{formErrorText(fieldErrors[f.name], locale)}</small>}
                </>
              )}
            </label>
          );
        })}
      </div>
      <footer>
        <button className="btn" type="submit" disabled={busy}>
          {busy ? t('Saving…') : t(cta ?? 'Create')}
        </button>
        <button className="btn ghost" type="button" disabled={busy} onClick={() => setOpen(false)}>{t('Cancel')}</button>
      </footer>
    </form>
  );
}

export function Flash({ error, done, lang }: { error?: string; done?: string; lang?: Lang }) {
  const t = translator(lang ?? 'en');
  if (error) return <p className="err" role="alert" style={{ marginBlockEnd: 16 }}>{lang === 'ar' ? 'تعذّر الحفظ. تحقق من البيانات وحاول مجددًا.' : t(error)}</p>;
  if (done) return <p className="okmsg" role="status" style={{ marginBlockEnd: 16 }}>
    {t('Created')}: {t(done)}</p>;
  return null;
}

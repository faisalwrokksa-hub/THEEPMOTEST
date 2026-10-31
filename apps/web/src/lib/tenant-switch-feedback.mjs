/** A failed switch must not look like a successful workspace change.
 * Only fixed, non-sensitive error codes may appear in browser redirects. */
export function tenantSwitchFailurePath(status) {
  if (status === 401) return '/login?error=expired';
  if (status === 403) return '/settings?switch=forbidden';
  if (status === 429) return '/settings?switch=rate_limited';
  if (!Number.isInteger(status) || status >= 500) return '/settings?switch=unavailable';
  return '/settings?switch=failed';
}

/** Fixed bilingual copy; never echo URL parameters or upstream responses. */
export function tenantSwitchFeedback(code, lang = 'en') {
  const messages = {
    forbidden: {
      en: 'Workspace was not changed. You do not have access to the selected workspace.',
      ar: 'لم تتغير مساحة العمل. ليست لديك صلاحية الوصول إلى مساحة العمل المحددة.',
    },
    rate_limited: {
      en: 'Workspace was not changed. Too many attempts; wait before trying again.',
      ar: 'لم تتغير مساحة العمل. محاولات كثيرة؛ انتظر قليلًا قبل إعادة المحاولة.',
    },
    unavailable: {
      en: 'Workspace change could not be confirmed. Refresh your current workspace before trying again.',
      ar: 'تعذّر تأكيد تغيير مساحة العمل. حدّث مساحة العمل الحالية قبل إعادة المحاولة.',
    },
    failed: {
      en: 'Workspace was not changed. Check your access and try again.',
      ar: 'لم تتغير مساحة العمل. تحقق من صلاحياتك وحاول مجددًا.',
    },
  };
  if (typeof code !== 'string' || !Object.hasOwn(messages, code)) return null;
  return messages[code][lang === 'ar' ? 'ar' : 'en'];
}

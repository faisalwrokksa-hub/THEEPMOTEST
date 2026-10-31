/** Fixed browser redirects for authenticated onboarding/profile/invitation mutations.
 * An expired cookie must return to sign-in; other failures must not masquerade as success.
 * Never include upstream bodies, user input, or credential-bearing paths in redirects.
 */
export function onboardingFailurePath(status) {
  if (status === 401) return '/login?error=expired';
  const code = status === 403 ? 'forbidden'
    : status === 409 ? 'conflict'
    : status === 429 ? 'rate_limited'
    : !Number.isInteger(status) || status >= 500 ? 'unavailable'
    : 'failed';
  return '/settings?onboarding=' + code;
}

/** Allowlisted bilingual failure feedback for workspace onboarding mutations. */
export function onboardingFeedback(code, lang = 'en') {
  const messages = {
    forbidden: {
      en: 'Your changes were not saved. You do not have permission for this workspace operation.',
      ar: 'لم تُحفظ التغييرات. ليست لديك صلاحية تنفيذ هذا الإجراء في مساحة العمل.',
    },
    conflict: {
      en: 'Your changes were not saved because this invitation or record already exists.',
      ar: 'لم تُحفظ التغييرات لأن هذه الدعوة أو السجل موجود بالفعل.',
    },
    rate_limited: {
      en: 'Your changes were not saved. Too many attempts; wait before trying again.',
      ar: 'لم تُحفظ التغييرات. محاولات كثيرة؛ انتظر قبل إعادة المحاولة.',
    },
    unavailable: {
      en: 'The operation could not be confirmed. Refresh the workspace before trying again; do not assume the invitation was sent.',
      ar: 'تعذّر تأكيد العملية. حدّث مساحة العمل قبل إعادة المحاولة؛ لا تفترض إرسال الدعوة.',
    },
    failed: {
      en: 'Your changes were not saved. Check the form and try again.',
      ar: 'لم تُحفظ التغييرات. تحقق من النموذج وحاول مجددًا.',
    },
  };
  if (typeof code !== 'string' || !Object.hasOwn(messages, code)) return null;
  return messages[code][lang === 'ar' ? 'ar' : 'en'];
}

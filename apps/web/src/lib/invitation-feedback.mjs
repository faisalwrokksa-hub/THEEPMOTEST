/** Invitation links contain a tenant UUID and a 256-bit URL-safe secret. */
export function validInvitationToken(value) {
  return typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.[A-Za-z0-9_-]{43}$/i.test(value);
}

/** Never display arbitrary upstream error bodies, tokens or internal details. */
export function invitationErrorText(status, lang = 'en') {
  const ar = lang === 'ar';
  if ([400, 401, 403, 404, 410].includes(status)) return ar
    ? 'رابط الدعوة غير صالح أو انتهت صلاحيته، أو تنقص بيانات الحساب الجديد. تحقق من الرابط والبيانات أو اطلب دعوة جديدة.'
    : 'The invitation is invalid or expired, or new-account details are missing. Check the link and details or request another invitation.';
  if (status === 429) return ar
    ? 'محاولات كثيرة. انتظر قليلًا ثم حاول مجددًا.'
    : 'Too many attempts. Please wait and try again.';
  if (status === 0 || status === 502 || status === 503 || status === 504) return ar
    ? 'الخدمة غير متاحة مؤقتًا. تحقق من اتصالك وحاول لاحقًا.'
    : 'The service is temporarily unavailable. Check your connection and try again.';
  return ar
    ? 'تعذّر قبول الدعوة. تحقق من البيانات وحاول مجددًا.'
    : 'The invitation could not be accepted. Check your details and try again.';
}

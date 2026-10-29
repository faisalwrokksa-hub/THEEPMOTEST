/**
 * Lightweight client-side feedback for common record-creation mistakes.
 * The API's Zod schemas and database constraints remain authoritative.
 * Returning message keys keeps UI copy localized without parsing server errors.
 */
const ERROR_TEXT = Object.freeze({
  invalid_project_code: { en: 'Use 2–16 letters, digits or hyphens.', ar: 'استخدم من ٢ إلى ١٦ حرفًا لاتينيًا أو رقمًا أو شرطة (-).' },
  invalid_date: { en: 'Enter a valid date.', ar: 'أدخل تاريخًا صحيحًا.' },
  end_before_start: { en: 'The finish date cannot be earlier than the start date.', ar: 'لا يمكن أن يكون تاريخ الانتهاء قبل تاريخ البدء.' },
  range_0_100: { en: 'Enter a whole number from 0 to 100.', ar: 'أدخل عددًا صحيحًا من ٠ إلى ١٠٠.' },
  range_1_100: { en: 'Enter a whole number from 1 to 100.', ar: 'أدخل عددًا صحيحًا من ١ إلى ١٠٠.' },
  range_1_5: { en: 'Enter a whole number from 1 to 5.', ar: 'أدخل عددًا صحيحًا من ١ إلى ٥.' },
  nonnegative: { en: 'Enter a number that is zero or greater.', ar: 'أدخل رقمًا يساوي صفرًا أو أكبر.' },
  finite_number: { en: 'Enter a valid number.', ar: 'أدخل رقمًا صحيحًا.' },
  currency: { en: 'Use a three-letter currency code such as SAR.', ar: 'استخدم رمز عملة من ثلاثة أحرف مثل SAR.' },
  required: { en: 'This field is required.', ar: 'هذا الحقل مطلوب.' },
  invalid: { en: 'Check this value and try again.', ar: 'تحقق من هذه القيمة ثم حاول مرة أخرى.' },
});
export function formErrorText(code, lang = 'en') {
  return (ERROR_TEXT[code] ?? ERROR_TEXT.invalid)[lang === 'ar' ? 'ar' : 'en'];
}
const validDay = s => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const date = new Date(`${s}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === s;
};
const numberIn = (s, min, max) => s === '' || (Number.isFinite(Number(s)) && Number.isInteger(Number(s)) && Number(s) >= min && Number(s) <= max);
const safeNumber = s => s === '' || (Number.isFinite(Number(s)) && Number(s) >= 0);

/** @returns {Record<string, string>} field -> error message key */
export function validateCreateForm(kind, values) {
  const errors = {};
  const get = field => String(values[field] ?? '').trim();
  const dates = (startField, endField) => {
    const start = get(startField), end = get(endField);
    if (start && !validDay(start)) errors[startField] = 'invalid_date';
    if (end && !validDay(end)) errors[endField] = 'invalid_date';
    if (start && end && validDay(start) && validDay(end) && end < start) errors[endField] = 'end_before_start';
  };
  if (kind === 'project') {
    if (get('code') && !/^[A-Za-z0-9-]{2,16}$/.test(get('code'))) errors.code = 'invalid_project_code';
    dates('startDate', 'endDate');
    if (!safeNumber(get('budgetAmount'))) errors.budgetAmount = 'nonnegative';
  } else if (kind === 'schedule-item') {
    dates('startDate', 'endDate');
    dates('baselineStart', 'baselineEnd');
    if (!numberIn(get('progressPct'), 0, 100)) errors.progressPct = 'range_0_100';
  } else if (kind === 'allocation') {
    dates('startDate', 'endDate');
    if (!numberIn(get('allocationPct'), 1, 100) || get('allocationPct') === '') errors.allocationPct = 'range_1_100';
  } else if (kind === 'raid' || kind === 'stakeholder') {
    for (const field of kind === 'raid' ? ['severity', 'likelihood'] : ['influence', 'interest']) {
      if (!numberIn(get(field), 1, 5)) errors[field] = 'range_1_5';
    }
  } else if (kind === 'cost') {
    if (get('amount') && !Number.isFinite(Number(get('amount')))) errors.amount = 'finite_number';
    if (get('currency') && !/^[A-Za-z]{3}$/.test(get('currency'))) errors.currency = 'currency';
  }
  return errors;
}

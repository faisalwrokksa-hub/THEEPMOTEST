/** Presentation-only trial guidance; never grants entitlement or writes sample data. */
export const TRIAL_STEPS = Object.freeze([
  {key: 'workspace', en: 'Configure workspace', ar: 'تهيئة مساحة العمل'},
  {key: 'team', en: 'Invite a colleague', ar: 'دعوة زميل'},
  {key: 'portfolio', en: 'Create a portfolio', ar: 'إنشاء محفظة'},
  {key: 'program', en: 'Create a programme', ar: 'إنشاء برنامج'},
  {key: 'project', en: 'Create a governed project', ar: 'إنشاء مشروع خاضع للحوكمة'},
]);
export function trialChecklist(tasks, language = 'en') {
  const byKey = new Map((Array.isArray(tasks) ? tasks : []).map(t => [t.key, t]));
  return TRIAL_STEPS.map(step => ({key: step.key, label: language === 'ar' ? step.ar : step.en,
    completed: byKey.get(step.key)?.completed === true}));
}
/** Explicitly synthetic read-only illustration. No persistence, identifiers, or real figures. */
export const TRIAL_EXAMPLE = Object.freeze({
  synthetic: true, project: 'Example: Digital Transformation',
  status: 'Illustrative only', risks: 2, decisions: 1,
});

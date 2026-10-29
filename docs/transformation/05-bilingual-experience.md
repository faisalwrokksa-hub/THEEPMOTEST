# English / Arabic Experience

- English: **The EPMO**, left-to-right. Arabic: **المكتب التنفيذي لإدارة المشاريع**, right-to-left.
- Existing `getLang()` reads `pmo_lang`; retain this cookie to preserve language selections. Root layout already uses `lang` and `dir` on HTML.
- Existing dictionary `packages/contracts/src/i18n.ts` is shared with the API for document exports.
- Check mixed Arabic/Latin project titles, LTR acronyms, form labels, validation messages, chart legends, long navigation labels, exports and print layouts.
- The login page now switches the prominent name, fields and call to action, but development-only hints and some secondary copy may still need complete localization.
- Screen-reader review and mobile RTL visual QA are required before claiming full bilingual completeness.

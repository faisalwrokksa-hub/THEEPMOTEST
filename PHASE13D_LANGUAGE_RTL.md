# Phase 13D — Arabic/English and RTL usability checkpoint

Baseline: `the-epmo-phase13c-project-workflows.zip`. Phase 12 live staging tasks remain deferred.

## Verified source changes

- Mobile drawer: Arabic/English accessible open/close labels, `aria-expanded`, Escape close, close-button focus, return focus on dismissal, close on route or link selection.
- Command palette: Arabic navigation-group labels in Arabic mode; the search query has automatic text direction, active result resets on filter changes, and the trigger announces expanded state.
- Workspace selector: localizes capability count and current workspace label and isolates mixed-language user and organization names.
- Data tables: locale-aware natural sorting, consistent empty-value placement for ascending and descending sorts, localized count digits, bidi isolation for plain-text values, and `aria-sort` only on sortable columns.
- Translations: Arabic strings added for newly exposed navigation and account labels.

## Verification actually performed

- `node --experimental-strip-types --test ...`: **263/263** offline tests passed (including 10 new locale/RTL unit and source checks).
- `node scripts/verify-release-static.mjs`: **8/8** release-check groups passed.
- `node scripts/verify-migration-chain.mjs`: **17/17** SQL migration definitions match the journal. No database migrations were changed by this milestone.
- `node scripts/dict.mjs`: 777 dictionary entries, no duplicate keys.
- TypeScript parser: 7 affected TS/TSX/declaration files passed syntax parsing; table helper's `.mjs` module resolves to its `.d.mts` typing.
- ZIP CRC validation passed.

## Still required before production

Full dependency-backed TypeScript checks, Next.js/NestJS build, interactive browser/mobile viewport and screen-reader testing in both languages, real PostgreSQL, Stripe test-mode payment, SES email delivery, staging/production acceptance.

This milestone is source-level improvement, **not** a production approval.

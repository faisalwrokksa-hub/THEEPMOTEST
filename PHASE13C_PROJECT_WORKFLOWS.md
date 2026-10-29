# The EPMO — Phase 13C: Portfolio, Programme & Project Workflow

## Delivered

- From a portfolio, click a programme to see projects belonging to it, or choose **Add project** to open project creation with that programme preselected (subject to permission and licence).
- Project listing filter runs in the tenant-scoped API query, **before pagination**, rather than filtering only a limited browser page.
- Project table links directly to the existing project governance detail page.
- Successful form creation of a project redirects to its governance page, where its first gate can be managed.
- Both project creation APIs now validate that the selected programme is visible inside the tenant and the owner belongs to the tenant before the insert. The secondary endpoint now checks `pmoa_manage_projects`, matching the primary create route.
- Project dates reject invalid calendar dates and a target finish earlier than project start.
- No migration required for this milestone. Existing 17 migrations remain unchanged.

## Checks

Run from the repository root:

```sh
npm run test:offline
npm run verify:static
npm run verify:migrations
```

The offline suite includes eight date-rule tests and eleven Phase 13C source-contract checks. Source-contract tests do not replace API integration tests with actual users and PostgreSQL row-level security.

## Deferred from Phase 12

The full dependency-backed Next.js/NestJS build, real PostgreSQL migration execution, cross-tenant runtime tests, Stripe test-mode payment, SES delivery, bilingual browser testing, and production acceptance are **not** complete. This code must be built and tested in staging before deployment.

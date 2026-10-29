# The EPMO — Architecture Assessment

Source review of the October 2026 supplied repository; not a production audit.

- `apps/web`: Next.js frontend with server-side session checks, English/Arabic translation and direction awareness.
- `apps/api`: NestJS API containing auth, project functionality, integration handlers, exports, and notifications.
- `packages/contracts`: shared authorization and English→Arabic translation dictionary.
- `packages/db`: PostgreSQL schema, RLS management, migrations, seed fixtures.
- `tests`: API integration checks covering auth, tenancy, modules, gate writes, Microsoft and notifications.
- `infra`, compose files and scripts: environment bootstrap and deployment assets.

Preserve stable module IDs, API paths, database identifiers, tenant boundaries and cookie names until versioned migration plans are in place. Refactor only after characterization tests exist.

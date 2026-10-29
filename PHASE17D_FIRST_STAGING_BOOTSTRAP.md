# The EPMO — Phase 17D: first staging bootstrap safety

**Baseline:** Phase 17C migration command safety source.

## Corrected failure path

A pre-migration backup from a brand-new staging database cannot yet have
`tenants`, `memberships`, or `schema_migrations`. The existing restore rehearsal
required those tables and blocked every initial staging deployment.

The updated rehearsal compares the pre-migration database schema state
with the isolated restored database state. It permits only `000` (fresh) and
`111` (existing) and fails any mismatch or partial state. Cleanup, checksum,
source-environment validation, and production refusal remain in effect.

## Verification boundaries

Automated tests run with mocked Docker/PostgreSQL commands; the change is
**not yet tested against an actual PostgreSQL server**. Staging execution,
Stripe test-mode payment, SES invitation, full application build, and
authenticated tenant isolation are still outstanding.

Execute on staging after installing dependencies and configuring secrets
securely. Never interpret a mock restore as a successful live recovery drill.

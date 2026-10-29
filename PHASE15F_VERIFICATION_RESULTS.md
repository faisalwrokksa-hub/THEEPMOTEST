# Phase 15F — Verified results

## Source changes

- `infra/deploy.sh`: build containers before database migration; back up staging/production PostgreSQL before schema changes; refuse migration if dump verification fails.
- `infra/backup-db.sh`: private custom-format PostgreSQL archive outside deployment directory, bounded DB readiness wait, archive TOC check, SHA-256 sidecar and checksum verification; no destructive restore logic.
- `scripts/phase15f-backup-release.test.mjs`: six focused tests including mocked successful and failing backups and deployment operation order.
- `PHASE15F_RELEASE_HANDOFF.md`: staged launch checklist, migration/backup precautions, restore rehearsal and rollback decision guide.

## Checks actually run in this workspace

- `npm run test:offline` — 487 passed, 0 failed (includes six new Phase 15F tests).
- `node scripts/verify-release-static.mjs` — 8/8 release-check groups passed.
- `node scripts/verify-migration-chain.mjs` — 18 ordered migration definitions verified.
- `bash -n infra/backup-db.sh infra/deploy.sh` — passed.
- `node --check scripts/phase15f-backup-release.test.mjs` — passed.
- ZIP package integrity and contents — verified after creation.

## Not run / not approved

- Full pnpm/Next.js/NestJS build (pnpm and installed dependencies unavailable).
- Real `pg_dump`, restore into an isolated PostgreSQL database or migrations on PostgreSQL (Docker/PostgreSQL unavailable).
- Signed Stripe test-mode payment, SES delivery, or live bilingual-browser acceptance.
- Real deployment, automatic rollback, or production launch evidence.

**Status: SOURCE RELEASE-HANDOFF CHECKPOINT ONLY. Production NO-GO.**

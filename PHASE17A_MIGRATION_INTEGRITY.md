# The EPMO — Phase 17A: Migration Content Integrity

## Change

- New `packages/db/migrations/meta/_sha256.json` pins SHA-256 digests for all 18 existing SQL migrations. The check hashes the **raw bytes** of each file; even an edited comment is detected.
- `scripts/verify-migration-chain.mjs` checks both journal sequence and file checksums; all CI migration commands that already invoke it now enforce immutable SQL inputs.
- `infra/bootstrap-db.sh` checks migration content **before touching PostgreSQL**. If the check fails, no role changes or migrations run.
- New regression tests cover a tampered SQL file, missing/new files, invalid hashes, manifest format, and staging/CI wiring.

## Maintenance rule

**Never rewrite an applied SQL migration to fix a bug.** Add the next numbered SQL migration, register it in `packages/db/migrations/meta/_journal.json`, and add its SHA-256 entry to the manifest in a code-reviewed change. Existing digest entries should not be changed. A changed digest for an existing migration requires explicit migration-history investigation before release.

## Local commands

```
node scripts/verify-migration-chain.mjs
node --test scripts/phase17a-migration-integrity.test.mjs
npm run test:offline
node scripts/verify-release-static.mjs
```

## Verification boundary

The checksum manifest prevents shipping accidentally edited SQL relative to this pinned source. It does **not** attest the bytes applied historically on a customer database, nor replace live PostgreSQL migration, RLS, restore, or Stripe/SES acceptance. Deployment remains blocked until those live checks pass.

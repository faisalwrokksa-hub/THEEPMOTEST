# The EPMO — P0 Checkpoint 10: Password Recovery

**Baseline:** `the-epmo-p0-session-revocation-checkpoint9(1).zip` (user-provided source ZIP).

## Implemented

1. `POST /auth/password-recovery/request`: accepts a validated email address and optional `en`/`ar` language; returns an account-neutral response for unknown, inactive, recently requested and successfully emailed accounts. IP throttle: 3 requests per 15 minutes. Active accounts are further limited to one issued link in a 15-minute window under a database advisory lock. Recovery is explicitly unavailable if email or secure web origin is not configured.
2. SES recovery email: links expire after **30 minutes**; token contains **256 cryptographically random bits**. Only the SHA-256 digest is stored; the raw token is never returned in HTTP responses. Failed deliveries trigger revocation of the issued token. URLs carry the token in a browser fragment, not in the request path/query.
3. `POST /auth/password-recovery/reset`: accepts a single-use token and a new password of 12–200 characters. IP throttle: 6 requests per 15 minutes. Bcrypt cost-12 computation happens before entering the database transaction.
4. Migration `0019_password_recovery.sql`: global `auth_password_resets` table, strict expiry/check constraints and `public.pmo_redeem_password_reset(text,text)` SECURITY DEFINER function. It holds a user row lock, rechecks the single-use token, updates `users.password_hash`, clears lockout state, **deletes ALL active sessions for that global user**, revokes any other outstanding reset tokens, and inserts an audit event atomically. Replays/expired/revoked tokens return failure.
5. Application database role: no `UPDATE(password_hash)` on `users`, no SELECT/UPDATE access to recovery token hashes, no direct token consumption. Restricted column grants support request issuance and delivery-failure revocation. ONLY the reviewed `SECURITY DEFINER` function may change an existing password. The function has no `PUBLIC` EXECUTE grant, and the Postgres privilege gate checks the boundaries.
6. Bilingual `/forgot-password` and `/reset-password` flows with local CSRF-checked Next.js proxy routes. Reset page erases the token fragment from browser history immediately and specifies no-referrer metadata.
7. Login page links to recovery. Development/demo credential hints are hidden on named staging/production deployments even if `NODE_ENV` is accidentally set to development.
8. Added 18 focused offline tests plus two opt-in live integration cases in `tests/password-recovery.test.ts` for one-use redemption, expiring tokens, session revocation, and CSRF.

## Verification actually performed

| Check | Result |
|---|---|
| `npm run test:offline` | **700/700 passed** |
| `node scripts/verify-release-static.mjs` | **8/8 passed** |
| `node scripts/verify-migration-chain.mjs` | **20/20 SQL migrations and pinned checksums verified** |
| `node scripts/rc1-release-gate.mjs` | **9/9 source-level preflight checks passed** |
| Changed TypeScript / TSX syntax parser | **13/13 passed**; not a full compiler typecheck |
| `bash -n infra/bootstrap-db.sh` | Passed |
| ZIP archive integrity test | Passed when packaged |

### NOT EXECUTED (critical launch blockers)

- Real PostgreSQL execution of migration `0019`, row-lock concurrency/replay tests, and effective privileges of the SECURITY DEFINER function and token table.
- SES email delivery, mail bounce handling and recovery links clicked in real browsers.
- The opt-in Vitest tests `tests/password-recovery.test.ts` against a running NestJS API and disposable PostgreSQL.
- Full pnpm dependency installation, Next.js and NestJS build/typecheck, production HTTPS acceptance, CI, Stripe customer billing tests, and all other live release requirements.

## Deployment / staging acceptance instructions

1. Before exposing recovery routes, apply all **20** migrations with the administrator SQL-ledger runner, then reapply `packages/db/sql/rls.sql`; execute `packages/db/sql/assert-global-role-privileges.sql` and existing financial RLS checks. Do **not** use the pmo_app role to execute migrations or change ownership of the SECURITY DEFINER function to pmo_app.
2. Configure `WEB_ORIGIN` to the real trusted HTTPS application origin, `MAIL_TRANSPORT=ses`, a verified `MAIL_FROM`, and the correct AWS credentials/region; confirm production SES recipient deliverability (including nonverified customer addresses after leaving the SES sandbox).
3. Request recovery for an active account and an unknown email; neither public response should disclose whether the account exists. Confirm an email for the active account only and no bearer token in logs/server URLs.
4. In a disposable database, run `P0_RECOVERY_LIVE_ACCEPTANCE=true NODE_ENV=test PHASE15_ACCEPT_DISPOSABLE_DB=YES_RESEED_DISPOSABLE_TEST_DATABASE pnpm exec vitest run tests/password-recovery.test.ts` with loopback `DATABASE_URL` (pmo_app), `DATABASE_URL_ADMIN` (administrator), and `TEST_API`. This reseeds development identities and MUST NEVER be used on customer databases.
5. Verify two existing sessions become invalid after redemption and a third-party account remains signed in. Reuse the same link, redeem an expired one, and attempt a cross-site POST; these must fail. Run DB permission assertions after the migration and policies.
6. Establish a privileged, periodic operational cleanup of recovery rows older than your approved retention period; pmo_app deliberately lacks DELETE privileges. Keep the auth audit ledger according to your retention policies.

**Residual risks:** Emailed delivery latency can create a measurable account-enumeration timing difference despite generic response bodies; assess this under live load and consider a durable async email queue before public launch. Concurrent password resets versus in-flight logins also require live concurrency testing. Recovery for accounts without email access requires a separate verified support identity process. This source checkpoint is **not** authorization to accept paying customers.

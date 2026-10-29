# The EPMO P0 checkpoint 9 — session revocation integrity

## Changes

1. `POST /auth/logout-all` requires a valid session cookie and revokes all sessions belonging to the signed-in user across workspaces, transactionally with an `auth_events` audit row. It never accepts a user ID from the request body.
2. The browser account menu has an English/Arabic “Sign out all devices” action. Its Next.js proxy endpoint requires trusted request provenance before forwarding the cookie.
3. Ordinary sign-out no longer swallows API failure. Both sign-out routes return HTTP 503 rather than pretending that the session has been revoked when the API is unreachable, leaving the user able to retry.
4. Added source regression tests in `tests/p0-session-revocation.test.mjs` and live multi-session API cases in `tests/auth.test.ts`.

## Verification limitations

- The offline Node test suite tests security contracts/source behavior. It does not execute the NestJS controller with a database.
- `tests/auth.test.ts` uses Vitest, a running API, and seeded PostgreSQL. Its new live tests **have not been executed** here.
- A full pnpm build, browser test, live PostgreSQL permissions and Stripe test-mode payment still need a configured runtime.
- **Account password reset and recovery are not implemented by this checkpoint.** A future design must preserve the database restriction that the ordinary app role cannot update an existing user's password hash. Avoid exposing an unsafe privileged password reset API.

## Operational acceptance

- Sign in twice as the same user on distinct devices. Sign out all devices from one. Both sessions must return HTTP 401; an unrelated user's session must remain valid.
- If the API is down, both logout routes must show a retryable HTTP 503 instead of displaying a successful sign-out.
- Ensure `auth_events` contains `logout.all` audit records with a session revocation count but no token values.
